"""
ChartInk FAST Quant Scanner
===========================
4 "output table" scrapes (+ 6 index lists + 1 master table) replace the ~300
individual screener scrapes. Every zone / NR scenario is now calculated in Python
from the raw values, and the Excel report is written by the SAME functions as
before, so the sheets and columns are identical and Hyperplane loads it unchanged.
Two extra sheets are appended at the end: Zone_Levels and Return_Potential.

Usage
-----
  python chartink_fast_scanner.py                    # scrape -> calculate -> Excel -> Telegram
  python chartink_fast_scanner.py --no-telegram      # same, but skip Telegram
  python chartink_fast_scanner.py --offline raw_20260926
                                                     # recalculate from a saved snapshot (no browser)
  python chartink_fast_scanner.py --validate         # ALSO scrape the old screeners and compare
                                                     # (slow, only for calibrating the rules)
  python chartink_fast_scanner.py --validate --only nr --limit 30
"""

import pandas as pd
import numpy as np
import re
import sys
import time
import configparser
import os
import asyncio
import argparse
from datetime import datetime, timedelta, timezone
import platform
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from collections import defaultdict

# Browser / Telegram libraries are only needed for live scraping and sending.
# They are imported softly so "--offline" recalculation works without them.
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, WebDriverException
    SELENIUM_AVAILABLE = True
except ImportError:  # pragma: no cover
    SELENIUM_AVAILABLE = False

    class TimeoutException(Exception):
        pass

    class WebDriverException(Exception):
        pass

try:
    import telegram
    TELEGRAM_AVAILABLE = True
except ImportError:  # pragma: no cover
    telegram = None
    TELEGRAM_AVAILABLE = False


# ============================================================================
# ============================================================================
#   SETTINGS  —  everything you may want to change is here
# ============================================================================
# ============================================================================

# ---------------------------------------------------------------- run --
MAX_RETRIES = 2
PAGE_LOAD_TIMEOUT = 60
ELEMENT_WAIT_TIMEOUT = 30
USE_PARALLEL_PROCESSING = True  # Set to False for sequential processing
TELEGRAM_RETRIES = 4            # tries per Telegram message / file when the connection fails
TELEGRAM_RETRY_WAIT = 15        # seconds before the 1st retry (then 30, 45 ...)
USE_MASTER_SCRAPE = True        # 1 extra page: official Marketcap labels for Master_Stock_Data.
                                # If it fails, Master_Stock_Data is built from raw-data-5 instead.
SAVE_RAW_SNAPSHOT = True        # keep the raw tables in raw_YYYYMMDD/ so you can re-run with --offline
MIN_EXPECTED_ROWS = {'daily_zones': 500, 'week_month': 500, 'quarter_year': 500, 'virgin_zones': 100, 'technicals': 500}
                                # safety check: a raw table with fewer rows = page did not load fully
                                # -> treated as a failed scrape and retried

# ---------------------------------------------------------------- data sources --
# The 4 "output table" screeners (Copy -> table). Your raw-data scans already keep only LTP > 10,
# so the code applies NO extra price filter and calculates on ALL stocks they return.
RAW_DATA_URLS = {
    'daily_zones':  'https://chartink.com/screener/raw-data-5',                 # close, prev closes, all zones, daily OHLC 0..12
    'week_month':   'https://chartink.com/screener/week-and-month-data',        # weekly + monthly OHLC 0..12
    'quarter_year': 'https://chartink.com/screener/quarterly-and-yearly-data',  # quarterly + yearly OHLC 0..12
    'virgin_zones': 'https://chartink.com/screener/virgin-data',                # top/bottom zone of the current + last 4 W/M/Q/Y bars
    'technicals':   'https://chartink.com/screener/technical-data-29',          # RSI, ADX, BB upper/lower, MACD, Supertrend, CCI for D/W/M/Q/Y
}
OPTIONAL_RAW_TABLES = {'technicals'}   # if one of these fails to load, the run continues without it
exclude_words = ['liquid', 'etf', 'nifty', 'bees']   # symbols containing these are skipped

# ---------------------------------------------------------------- NR (mother candle) --
#   1. mother candle = the candle N bars ago:
#        body |O-C| >= NR_MOTHER_BODY_PCT % of the candle range (H-L)
#   2. bars 1..N-1   = BODY (open and close) inside mother High..Low. Wicks may go outside.
#   3. latest close  = BO: >= mother High | BD: <= mother Low
#                      HN: inside and >= mother High * NR_NEAR_RATIO
#                      LW: inside and <= mother Low / NR_NEAR_RATIO
#   Same rule for all NR scans. No trend, no price filter, all stocks.
NR_MOTHER_BODY_PCT = 60         # set from Admin by the server app; the old ChartInk "1.5" factor = 50
NR_NEAR_RATIO = 1.9 / 2         # near-high: close >= high * 0.95   |   near-low: close <= low * 2/1.9

# ---------------------------------------------------------------- VIRGIN BO / BD --
#   for i = 1..N :  i bars ago High <= i bars ago top_zone      (that bar's OWN zone)
#                   i bars ago Low  >= i bars ago bottom_zone   (that bar's OWN zone)
#   Breakdown    :  Daily Close <= current bottom_zone of that timeframe
#   Breakout     :  Daily Close >= current top_zone of that timeframe
#   All stocks, no price filter.

# ---------------------------------------------------------------- OVERLAP / RETRACEMENT --
#   Overlap low  : <a> bottom_zone inside <b> top band    (<= b top_zone and >= b top_near)
#   Overlap high : <a> top_zone inside <b> bottom band    (>= b bottom_zone and <= b bottom_near)
#   Break        : close beyond <a>'s own zone  (weekly_ versions: Weekly Close CROSSED it)
#   Retracement  : close inside <a>'s band      (bottom_zone..bottom_near  or  top_near..top_zone)

# ---------------------------------------------------------------- PRICE HEALTH (Price_Health sheet) --
# Finds stocks with poor long-term price action (e.g. IDEA: ~120 at its peak, now ~14) using the
# yearly candles (current year + last 12 years):
#   Peak_High              = highest yearly High in that history
#   Drawdown_From_Peak_Pct = how far the current price is below that peak
#   Return_5Y_Pct          = current price vs the yearly close 5 years ago
#   Worst_Crash_Pct        = deepest fall at any time in that history (a year's low vs the highest high before it)
#   Run_Up_From_3Y_Low_X   = current price ÷ lowest low of the last 3 years (+ this year)
#   POOR    : price is more than HEALTH_POOR_DRAWDOWN_PCT % below its peak, OR
#             crashed HEALTH_CRASH_POOR_PCT %+ with the bottom in the last HEALTH_CRASH_RECENT_YEARS years, OR
#             a round trip: crashed HEALTH_CRASH_WEAK_PCT %+ AND now HEALTH_ROUNDTRIP_X x+ its 3-year low
#             (e.g. MBECL: ~380 → ~3 → 494, a 98% crash then 170x — the owner's example, 2026-10-04)
#   WEAK    : more than HEALTH_WEAK_DRAWDOWN_PCT % below its peak, OR lower than HEALTH_WEAK_YEARS years ago, OR
#             crashed HEALTH_CRASH_WEAK_PCT %+ at any time, OR now HEALTH_RUNUP_WEAK_X x+ its 3-year low
#   HEALTHY : everything else
# (an old crash alone only makes WEAK: unadjusted demergers can look like crashes in old yearly data, e.g. ADANIENT 2015)
HEALTH_POOR_DRAWDOWN_PCT = 70
HEALTH_WEAK_DRAWDOWN_PCT = 50
HEALTH_WEAK_YEARS = 5
HEALTH_CRASH_POOR_PCT = 90
HEALTH_CRASH_RECENT_YEARS = 5
HEALTH_CRASH_WEAK_PCT = 80
HEALTH_ROUNDTRIP_X = 10
HEALTH_RUNUP_WEAK_X = 8
# Stretched / parabolic: price ÷ lowest monthly low of the last 12 months (owner's STLTECH example 2026-10-10:
# ~100 → ~1,000 in a year — "anytime it will come down, not proper growth"). On 6 Oct data 72 of 2,658 stocks were
# ≥ 3x and 9 were ≥ 5x their 1-year low.
HEALTH_STRETCH_WEAK_X = 3        # ≥ 3x in a year  → WEAK ("stretched")
HEALTH_STRETCH_POOR_X = 5        # ≥ 5x in a year  → POOR ("parabolic")

# ---------------------------------------------------------------- FAILED NR / TRAP (Failed_NR sheet) --
#   Same mother candle as NR (NR_MOTHER_BODY_PCT), then:
#   Failed BO -> BUY  : one or more bars after the mother CLOSED above mother High (breakout),
#                       no bar closed below mother Low, every other bar's body stayed inside,
#                       and the latest close is back inside, near mother Low (close <= Low / NR_NEAR_RATIO)
#                       Entry = price | Stop = mother Low | Target = mother High
#   Failed BD -> SELL : the mirror (closed below Low, now back inside near mother High)
#   Timeframes / lengths = the same ones as your NR scans (D W M Q Y, 4..12 bars); per stock and
#   timeframe the biggest mother candle is kept.

# ---------------------------------------------------------------- ZONE RETEST (Zone_Retest sheet) --
#   Owner's rule (2026-09-29): "last month closed above the last month zone and now LTP is near the
#   current month zone bottom" — the same for every timeframe below, and the mirror for sells:
#   BUY  : previous bar CLOSE > the previous bar's OWN top_zone (virgin-data)
#          and close inside the CURRENT bar's bottom band (bottom_zone .. bottom_near)
#   SELL : previous bar CLOSE < the previous bar's OWN bottom_zone
#          and close inside the CURRENT bar's top band (top_near .. top_zone)
#   Daily is not included: the raw scans have no previous-day zones.
ZONE_RETEST_TFS = 'wmqy'

# ---------------------------------------------------------------- Return_Potential sheet --
NEAR_ENTRY_PCT = 3.0            # "Near Entry" status when price is within this % of the monthly breakout level
                                # stop = other edge of the monthly breakout band (top_near for longs)


def create_config_if_not_exists():
    """Create config file if it doesn't exist"""
    if not os.path.exists('config.ini'):
        config = configparser.ConfigParser()
        config['Telegram'] = {
            'bot_token': 'NIL',
            'chat_id': 'NIL'
        }
        with open('config.ini', 'w') as configfile:
            config.write(configfile)
        print("Config file created. Please edit config.ini with your Telegram credentials.")
        return False
    return True

def load_config():
    """Load configuration"""
    config = configparser.ConfigParser()
    config.read('config.ini')
    return {
        'bot_token': config['Telegram']['bot_token'],
        'chat_id': config['Telegram']['chat_id']
    }

async def _telegram_retry(label, make_call):
    """Run one Telegram call; on a network error (no connection / timeout) wait and try again."""
    for attempt in range(1, TELEGRAM_RETRIES + 1):
        try:
            await make_call()
            return True
        except telegram.error.NetworkError as e:          # includes httpx.ConnectError and TimedOut
            if attempt == TELEGRAM_RETRIES:
                print(f"  ✗ {label}: {e} (gave up after {attempt} tries)")
                return False
            wait = TELEGRAM_RETRY_WAIT * attempt
            print(f"  ⚠ {label}: {e} — try {attempt}/{TELEGRAM_RETRIES}, retrying in {wait}s...")
            await asyncio.sleep(wait)
        except Exception as e:                              # bad token / chat id etc. — retrying will not help
            print(f"  ✗ {label}: {e}")
            return False


async def send_telegram_file(bot_token, chat_id, file_path, caption):
    """Send Excel file to Telegram with caption length handling (retries on network errors)"""
    bot = telegram.Bot(token=bot_token)
    timeouts = dict(read_timeout=90, write_timeout=90, connect_timeout=30)

    async def send_doc(cap):
        with open(file_path, 'rb') as file:
            await bot.send_document(chat_id=chat_id, document=file, caption=cap, **timeouts)

    # Telegram document caption limit is 1024 characters
    if len(caption) > 1020:  # Leave some buffer
        print(f"  ⚠ Caption too long ({len(caption)} chars), splitting...")
        text_ok = await _telegram_retry("Summary message",
                                        lambda: bot.send_message(chat_id=chat_id, text=caption[:4096], **timeouts))
        if text_ok:
            print("  ✓ Full message sent separately")
        short_caption = f"📊 Analysis Report\n📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S IST')}"
        file_ok = await _telegram_retry("Excel file", lambda: send_doc(short_caption))
    else:
        text_ok = True
        file_ok = await _telegram_retry("Excel file", lambda: send_doc(caption))

    if file_ok:
        print(f"  ✓ File sent: {file_path}")
    if not (text_ok and file_ok):
        print("  ✗ Telegram could not be reached. The Excel is saved on this computer:")
        print(f"      {os.path.abspath(file_path)}")
        print("    To send it again later without scraping, run:")
        print(f"      python {os.path.basename(sys.argv[0] or 'chartink_fast.py')} --offline raw_{datetime.now().strftime('%Y%m%d')}")
    return text_ok and file_ok


async def send_telegram_message(bot_token, chat_id, message):
    """Send text message to Telegram"""
    try:
        bot = telegram.Bot(token=bot_token)
        await bot.send_message(chat_id=chat_id, text=message)
        print(f"✓ Message sent to Telegram")
        return True
    except Exception as e:
        print(f"Error sending message to Telegram: {str(e)}")
        return False

def setup_driver():
    """Setup Chrome driver - works on both Windows and Linux in headless mode"""
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument('--log-level=3')
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    options.add_experimental_option('useAutomationExtension', False)
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    options.page_load_strategy = 'normal'

    options.add_argument("--disable-gpu")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--disable-dev-shm-usage")

    prefs = {
        "profile.default_content_setting_values.clipboard": 1,
    }
    options.add_experimental_option("prefs", prefs)

    if platform.system() == 'Linux':
        options.binary_location = '/usr/bin/chromium-browser'
        service = Service('/usr/bin/chromedriver')
    else:
        service = Service()

    driver = webdriver.Chrome(service=service, options=options)

    driver.execute_cdp_cmd('Network.setUserAgentOverride', {
        "userAgent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    try:
        driver.execute_cdp_cmd('Browser.grantPermissions', {
            'permissions': ['clipboardReadWrite', 'clipboardSanitizedWrite'],
            'origin': 'https://chartink.com'
        })
        print("✓ Clipboard permissions granted")
    except Exception as e:
        print(f"⚠ Could not grant clipboard permissions: {str(e)}")

    driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)

    return driver


# ============================================================================
# PASTE YOUR FULL zone_urls DICTIONARY HERE (unchanged from your current file)
# ============================================================================
zone_urls = {
    # === LONG SIGNALS ===
    'Daily_Close_Above_Monthly_Zone': 'https://chartink.com/screener/daily-cls-abv-mn-zn',
    'Daily_Close_Crossed_Above_Monthly_Zone': 'https://chartink.com/screener/daily-cls-cro-abv-mn-zn',
    'Weekly_Close_Crossed_Above_Monthly_Zone': 'https://chartink.com/screener/cur-w-cls-cro-abv-mn-zn',
    'Near_Monthly_Zone_Top': 'https://chartink.com/screener/near-mn-zn-top',
    'Close_Above_Weekly_Zone_Below_Monthly_Zone': 'https://chartink.com/screener/close-abv-w-zone-blw-m-zone',
    'Daily_Close_Crossed_Above_Weekly_Zone_Below_Monthly_Zone': 'https://chartink.com/screener/day-close-csd-abv-w-zone-blw-m-zone-high',
    'Weekly_Close_Crossed_Above_Weekly_Zone_Below_Monthly_Zone': 'https://chartink.com/screener/w-close-csd-abv-w-zone-blw-m-zone-high',
    'Daily_Close_Above_Quarterly_Zone': 'https://chartink.com/screener/d-close-abv-q-zone',
    'Quarterly_Close_Above_Monthly_Zone_Below_Quarterly_Zone': 'https://chartink.com/screener/q-close-abv-m-zone-blw-q-zone',
    'Quarterly_Close_Crossed_Above_Monthly_Zone_Below_Quarterly_Zone': 'https://chartink.com/screener/q-close-csd-abv-m-zone-blw-q-zone',
    'Weekly_Close_Crossed_Above_Monthly_Zone_Below_Quarterly_Zone': 'https://chartink.com/screener/w-close-csd-abv-m-zone-blw-q-zone',

    # === SHORT SIGNALS ===
    'Daily_Close_Below_Monthly_Zone_Low': 'https://chartink.com/screener/daily-cls-blw-mn-zn-low',
    'Daily_Close_Crossed_Below_Monthly_Zone_Low': 'https://chartink.com/screener/daily-cls-cro-blw-mn-zn-low',
    'Weekly_Close_Crossed_Below_Monthly_Zone_Low': 'https://chartink.com/screener/cur-w-cls-cro-blw-mn-zn-low',
    'Near_Monthly_Zone_Low': 'https://chartink.com/screener/near-mn-zn-low',
    'Daily_Close_Below_Weekly_Zone_Above_Monthly_Zone_Low': 'https://chartink.com/screener/d-close-blw-w-zone-abv-m-zone-low',
    'Daily_Close_Crossed_Below_Weekly_Zone_Above_Monthly_Zone_Low': 'https://chartink.com/screener/day-close-csd-blw-w-zone-abv-m-zone-low',
    'Weekly_Close_Crossed_Below_Weekly_Zone_Above_Monthly_Zone_Low': 'https://chartink.com/screener/w-close-csd-blw-w-zone-abv-m-zone-low',
    'Daily_Close_Below_Quarterly_Zone_Low': 'https://chartink.com/screener/d-close-blw-q-zone-low',
    'Daily_Close_Below_Monthly_Zone_Above_Quarterly_Zone': 'https://chartink.com/screener/d-close-blw-m-zone-abv-q-zone',
    'Daily_Close_Crossed_Below_Monthly_Zone_Above_Quarterly_Zone': 'https://chartink.com/screener/d-close-csd-blw-m-zone-abv-q-zone',
    'Weekly_Close_Crossed_Below_Monthly_Zone_Above_Quarterly_Zone': 'https://chartink.com/screener/w-close-csd-blw-m-zone-abv-q-zone',

    # === DAILY ZONE ===
    'Daily_Close_Above_Daily_Zone_High': 'https://chartink.com/screener/d-close-abv-d-z-high',
    'Daily_Close_Below_Daily_Zone_Low': 'https://chartink.com/screener/d-close-blw-d-z-low',
    'Daily_Close_Above_Weekly_Zone_High_Below_Monthly_Zone_High': 'https://chartink.com/screener/d-close-abv-w-z-high-blw-m-z-high-2',
    'Daily_Close_Below_Weekly_Zone_Low_Above_Monthly_Zone_Low': 'https://chartink.com/screener/d-close-blw-w-z-low-abv-m-z-low',
    'Daily_Close_Above_Weekly_Zone_High': 'https://chartink.com/screener/d-close-abv-w-z-high',
    'Daily_Close_Below_Weekly_Zone_Low': 'https://chartink.com/screener/d-close-blw-w-z-low',
    'Daily_Close_Near_Daily_Zone_High': 'https://chartink.com/screener/d-close-near-d-z-high',
    'Daily_Close_Near_Daily_Zone_Low': 'https://chartink.com/screener/d-close-near-d-z-low',

    # === OVERLAPPING ZONES === using the near top and top identify the value of the falling in between. if the zones are overlapped  means very stong resistance and if it broke the bo will the very strong breakout.
    'Daily_Close_Near_and_abv_Overlap_Weekly_Monthly_Zone_Low': 'https://chartink.com/screener/d-close-near-overlap-w-m-z-low',
    'Daily_Close_Near_and_blw_Overlap_Weekly_Monthly_Zone_High': 'https://chartink.com/screener/d-close-near-overlap-w-m-z-high',
    'Daily_Close_Near_and_abv_Overlap_monthly_quaterly_Zone_Low': 'https://chartink.com/screener/daily-close-near-and-abv-overlap-monthly-quaterly-zone-low',
    'Daily_Close_Near_and_blw_Overlap_Monthly_quaterly_Zone_High': 'https://chartink.com/screener/daily-close-near-and-blw-overlap-monthly-quaterly-zone-high',
    'Daily_Close_Near_and_abv_Overlap_monthly_yearly_Zone_Low': 'https://chartink.com/screener/daily-close-near-and-abv-overlap-monthly-yearly-zone-low',
    'Daily_Close_Near_and_blw_Overlap_Monthly_yearly_Zone_High': 'https://chartink.com/screener/daily-close-near-and-blw-overlap-monthly-yearly-zone-high',
    'Daily_Close_Above_w_z_high_Overlap_w_m_z_low': 'https://chartink.com/screener/d-close-above-w-z-h-overlap-w-m-z-low',
    'Daily_Close_Below_w_z_low_Overlap_w_m_z_High': 'https://chartink.com/screener/d-close-below-w-z-l-overlap-w-m-z-high',
    'Daily_Close_Above_m_z_high_Overlap_m_y_z_low': 'https://chartink.com/screener/daily-close-above-m-z-high-overlap-m-y-z-low',
    'Daily_Close_Below_m_z_low_Overlap_m_y_z_High': 'https://chartink.com/screener/daily-close-below-m-z-low-overlap-m-y-z-high',
    'weekly_Close_Above_w_z_High_Overlap_wzh_mzl': 'https://chartink.com/screener/d-close-abv-w-z-high-overlap-wzh-mzl',
    'weekly_Close_Below_w_z_Low_Overlap_wzl_mzh': 'https://chartink.com/screener/w-close-blw-w-z-low-overlap-wzl-mzh',
    'weekly_Close_Above_m_z_High_Overlap_mzh_qzl': 'https://chartink.com/screener/d-close-abv-m-z-high-overlap-mzh-qzl',
    'weekly_Close_Below_m_z_Low_Overlap_mzl_qzh': 'https://chartink.com/screener/w-close-blw-m-z-low-overlap-mzl-qzh',
    'weekly_close_Above_d_z_high_Overlap_dzh_wzl': 'https://chartink.com/screener/d-close-abv-d-z-high-overlap-dzh-wzl',
    'weekly_close_below_d_z_low_Overlap_dzl_wzh': 'https://chartink.com/screener/d-close-blw-d-z-low-overlap-dzl-wzh',
    'weekly_Close_Above_m_z_High_Overlap_mzh_yzl': 'https://chartink.com/screener/d-close-abv-m-z-high-overlap-mzh-yzl',
    'weekly_Close_Below_m_z_Low_Overlap_mzl_yzh': 'https://chartink.com/screener/w-close-blw-m-z-low-overlap-mzl-yzh',

    # === RETRACEMENT ZONES ===like lower zones are overlapped with the top zomes of the other timeframe .. means retracement opportunity.
    'Daily_Close_Near_wz_low_Overlap_wlz_mhz': 'https://chartink.com/screener/d-close-near-overlap-w-l-m-h',
    'Daily_Close_Near_wz_high_Overlap_whz_mlz': 'https://chartink.com/screener/d-close-near-overlap-w-h-m-l',
    'Daily_Close_Near_dz_low_Overlap_dlz_mhz': 'https://chartink.com/screener/d-close-near-overlap-d-l-m-h-2',
    'Daily_Close_Near_dz_high_Overlap_dhz_mlz': 'https://chartink.com/screener/d-close-near-overlap-d-l-m-h',
    'Daily_Close_Near_mz_low_Overlap_mlz_qhz': 'https://chartink.com/screener/daily-close-near-mz-low-overlap-mlz-qhz',
    'Daily_Close_Near_mz_low_Overlap_mlz_yhz': 'https://chartink.com/screener/daily-close-near-mz-low-overlap-mlz-yhz',
    'Daily_Close_Near_mz_high_Overlap_mhz_ylz': 'https://chartink.com/screener/daily-close-near-mz-high-overlap-mhz-ylz',

    # === TRENDING ZONES ===
    'last_4mon_up_trend_with_close_nearto_low_zone': 'https://chartink.com/screener/4m-up-trend-with-close-nearto-mlz',
    'last_4mon_down_trend_with_close_nearto_high_zone': 'https://chartink.com/screener/4m-dwn-trend-with-close-nearto-mhz',
    'last_3mon_up_trend_with_close_nearto_low_zone': 'https://chartink.com/screener/3m-up-trend-with-close-nearto-mlz',
    'last_3mon_down_trend_with_close_nearto_high_zone': 'https://chartink.com/screener/3m-dwn-trend-with-close-nearto-mhz',
    'last_4wk_up_trend_with_close_nearto_low_zone': 'https://chartink.com/screener/4w-up-trend-with-close-nearto-wlz',
    'last_4wk_down_trend_with_close_nearto_high_zone': 'https://chartink.com/screener/4w-dwn-trend-with-close-nearto-whz',
    'last_3wk_up_trend_with_close_nearto_low_zone': 'https://chartink.com/screener/3w-up-trend-with-close-nearto-wlz',
    'last_3wk_down_trend_with_close_nearto_high_zone': 'https://chartink.com/screener/3w-dwn-trend-with-close-nearto-whz',
    'last_4day_up_trend_with_close_nearto_low_zone': 'https://chartink.com/screener/4d-up-trend-with-close-nearto-dlz',
    'last_4day_down_trend_with_close_nearto_high_zone': 'https://chartink.com/screener/4d-dwn-trend-with-close-nearto-dhz',
    'last_3day_up_trend_with_close_nearto_low_zone': 'https://chartink.com/screener/3d-up-trend-with-close-nearto-dlz',
    'last_3day_down_trend_with_close_nearto_high_zone': 'https://chartink.com/screener/3d-dwn-trend-with-close-nearto-dhz',

    # === FLAG PATTERN ===
    'last_4mon_up_trend_with_close_low_zone_breakdown': 'https://chartink.com/screener/4m-up-trend-crossed-blw-mlz',
    'last_4mon_down_trend_with_close_high_zone_broakup': 'https://chartink.com/screener/4m-dwn-trend-crossed-abv-mhz',
    'last_3mon_up_trend_with_close_low_zone_breakdown': 'https://chartink.com/screener/3m-up-trend-crossed-blw-mlz',
    'last_3mon_down_trend_with_close_high_zone_broakup': 'https://chartink.com/screener/3m-dwn-trend-crossed-abv-mhz',
    'last_4wk_up_trend_with_close_low_zone_breakdown': 'https://chartink.com/screener/4w-up-trend-crossed-blw-wlz',
    'last_4wk_down_trend_with_close_high_zone_broakup': 'https://chartink.com/screener/4w-dwn-trend-with-crossed-abv-whz',
    'last_3wk_up_trend_with_close_low_zone_breakdown': 'https://chartink.com/screener/3w-up-trend-crossed-blw-wlz',
    'last_3wk_down_trend_with_close_high_zone_broakup': 'https://chartink.com/screener/3w-dwn-trend-crossed-abv-whz',
    'last_4day_up_trend_with_close_low_zone_breakdown': 'https://chartink.com/screener/4d-up-trend-crossed-blw-dlz',
    'last_4day_down_trend_with_close_high_zone_broakup': 'https://chartink.com/screener/4d-dwn-trend-crossed-abv-dhz',
    'last_3day_up_trend_with_close_low_zone_breakdown': 'https://chartink.com/screener/3d-up-trend-croosed-blw-dlz',
    'last_3day_down_trend_with_close_high_zone_broakup': 'https://chartink.com/screener/3d-dwn-trend-crossed-abv-dhz',

    # === VIRGIN BREAKOUT (LONG) ===
    'last_4_month_virgin_breakout_top_zone': 'https://chartink.com/screener/4m-vg-bo-mzh',
    'last_3_month_virgin_breakout_top_zone': 'https://chartink.com/screener/3m-vg-bo-mzh',
    'last_2_month_virgin_breakout_top_zone': 'https://chartink.com/screener/2m-vg-bo-mzh',
    'last_4_week_virgin_breakout_top_zone': 'https://chartink.com/screener/4w-vg-bo-mzh',
    'last_3_week_virgin_breakout_top_zone': 'https://chartink.com/screener/3w-vg-bo-mzh',
    'last_2_week_virgin_breakout_top_zone': 'https://chartink.com/screener/2w-vg-bo-mzh',
    'last_4_quarter_virgin_breakout_top_zone': 'https://chartink.com/screener/4q-vg-bo-mzh',
    'last_3_quarter_virgin_breakout_top_zone': 'https://chartink.com/screener/3q-vg-bo-mzh',
    'last_2_quarter_virgin_breakout_top_zone': 'https://chartink.com/screener/2q-vg-bo-mzh',
    'last_4_year_virgin_breakout_top_zone': 'https://chartink.com/screener/4y-vg-bo-mzh',
    'last_3_year_virgin_breakout_top_zone': 'https://chartink.com/screener/3y-vg-bo-mzh',
    'last_2_year_virgin_breakout_top_zone': 'https://chartink.com/screener/2y-vg-bo-mzh',

    # === VIRGIN BREAKDOWN (SHORT) ===
    'last_4_month_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/4m-vg-bd-mlz',
    'last_3_month_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/3m-vg-bd-mlz',
    'last_2_month_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/2m-vg-bd-mlz',
    'last_4_week_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/4w-vg-bd-wlz',
    'last_3_week_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/3w-vg-bd-wlz',
    'last_2_week_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/2w-vg-bd-wlz',
    'last_4_quarter_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/4q-vg-bd-qlz',
    'last_3_quarter_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/3q-vg-bd-qlz',
    'last_2_quarter_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/2q-vg-bd-qlz',
    'last_4_year_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/4y-vg-bd-ylz',
    'last_3_year_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/3y-vg-bd-ylz',
    'last_2_year_virgin_breakdown_bottom_zone': 'https://chartink.com/screener/2y-vg-bd-ylz',
}

nr_urls = {
    # === BREAKOUT ===
    'W_NR_4W_BO': 'https://chartink.com/screener/w-nr-4w-bo',
    'W_NR_5W_BO': 'https://chartink.com/screener/w-nr-5w-bo',
    'W_NR_6W_BO': 'https://chartink.com/screener/w-nr-6w-bo',
    'W_NR_7W_BO': 'https://chartink.com/screener/w-nr-7w-bo',
    'W_NR_8W_BO': 'https://chartink.com/screener/w-nr-8w-bo',
    'W_NR_9W_BO': 'https://chartink.com/screener/w-nr-9w-bo',
    'W_NR_10W_BO': 'https://chartink.com/screener/w-nr-10w-bo',
    'W_NR_11W_BO': 'https://chartink.com/screener/w-nr-11w-bo',
    'W_NR_12W_BO': 'https://chartink.com/screener/w-nr-12w-bo',
    'M_N_4M_BO': 'https://chartink.com/screener/m-n-4m-bo',
    'M_N_5M_BO': 'https://chartink.com/screener/m-n-5m-bo',
    'M_N_6M_BO': 'https://chartink.com/screener/m-n-6m-bo',
    'M_N_7M_BO': 'https://chartink.com/screener/m-n-7m-bo',
    'M_N_8M_BO': 'https://chartink.com/screener/m-n-8m-bo',
    'M_N_9M_BO': 'https://chartink.com/screener/m-n-9m-bo',
    'M_N_10M_BO': 'https://chartink.com/screener/m-n-10m-bo',
    'M_N_11M_BO': 'https://chartink.com/screener/m-n-11m-bo',
    'M_N_12M_BO': 'https://chartink.com/screener/m-n-12m-bo',
    'Q_N_4Q_BO': 'https://chartink.com/screener/q-n-4q-bo',
    'Q_N_5Q_BO': 'https://chartink.com/screener/q-n-5q-bo',
    'Q_N_6Q_BO': 'https://chartink.com/screener/q-n-6q-bo',
    'Q_N_7Q_BO': 'https://chartink.com/screener/q-n-7q-bo',
    'Q_N_8Q_BO': 'https://chartink.com/screener/q-n-8q-bo',
    'Q_N_9Q_BO': 'https://chartink.com/screener/q-n-9q-bo',
    'Q_N_10Q_BO': 'https://chartink.com/screener/q-n-10q-bo',
    'Q_N_11Q_BO': 'https://chartink.com/screener/q-n-11q-bo',
    'Q_N_12Q_BO': 'https://chartink.com/screener/q-n-12q-bo',
    'Y_N_4Y_BO': 'https://chartink.com/screener/y-n-4y-bo',
    'Y_N_5Y_BO': 'https://chartink.com/screener/y-n-5y-bo',
    'Y_N_6Y_BO': 'https://chartink.com/screener/y-n-6y-bo',
    'Y_N_7Y_BO': 'https://chartink.com/screener/y-n-7y-bo',
    'Y_N_8Y_BO': 'https://chartink.com/screener/y-n-8y-bo',
    'Y_N_9Y_BO': 'https://chartink.com/screener/y-n-9y-bo',
    'Y_N_10Y_BO': 'https://chartink.com/screener/y-n-10y-bo',
    'Y_N_11Y_BO': 'https://chartink.com/screener/y-n-11y-bo',
    'Y_N_12Y_BO': 'https://chartink.com/screener/y-n-12y-bo',
    'D_N_4D_BO': 'https://chartink.com/screener/d-n-4d-bo',
    'D_N_5D_BO': 'https://chartink.com/screener/d-n-5d-bo',
    'D_N_6D_BO': 'https://chartink.com/screener/d-n-6d-bo',
    'D_N_7D_BO': 'https://chartink.com/screener/d-n-7d-bo',
    'D_N_8D_BO': 'https://chartink.com/screener/d-n-8d-bo',
    'D_N_9D_BO': 'https://chartink.com/screener/d-n-9d-bo',
    'D_N_10D_BO': 'https://chartink.com/screener/d-n-10d-bo',
    'D_N_11D_BO': 'https://chartink.com/screener/d-n-11d-bo',
    'D_N_12D_BO': 'https://chartink.com/screener/d-n-12d-bo',

    # === NEAR TO TOP BREAKOUT ===
    'W_N_4W_HN': 'https://chartink.com/screener/w-n-4w-hn',
    'W_N_5W_HN': 'https://chartink.com/screener/w-n-5w-hn',
    'W_N_6W_HN': 'https://chartink.com/screener/w-n-6w-hn',
    'W_N_7W_HN': 'https://chartink.com/screener/w-n-7w-hn',
    'W_N_8W_HN': 'https://chartink.com/screener/w-n-8w-hn',
    'W_N_9W_HN': 'https://chartink.com/screener/w-n-9w-hn',
    'W_N_10W_HN': 'https://chartink.com/screener/w-n-10w-hn',
    'W_N_11W_HN': 'https://chartink.com/screener/w-n-11w-hn',
    'W_N_12W_HN': 'https://chartink.com/screener/w-n-12w-hn',
    'M_N_4M_HN': 'https://chartink.com/screener/m-n-4m-hn',
    'M_N_5M_HN': 'https://chartink.com/screener/m-n-5m-hn',
    'M_N_6M_HN': 'https://chartink.com/screener/m-n-6m-hn',
    'M_N_7M_HN': 'https://chartink.com/screener/m-n-7m-hn',
    'M_N_8M_HN': 'https://chartink.com/screener/m-n-8m-hn',
    'M_N_9M_HN': 'https://chartink.com/screener/m-n-9m-hn',
    'M_N_10M_HN': 'https://chartink.com/screener/m-n-10m-hn',
    'M_N_11M_HN': 'https://chartink.com/screener/m-n-11m-hn',
    'M_N_12M_HN': 'https://chartink.com/screener/m-n-12m-hn',
    'Q_N_4Q_HN': 'https://chartink.com/screener/q-n-4q-hn',
    'Q_N_5Q_HN': 'https://chartink.com/screener/q-n-5q-hn',
    'Q_N_6Q_HN': 'https://chartink.com/screener/q-n-6q-hn',
    'Q_N_7Q_HN': 'https://chartink.com/screener/q-n-7q-hn',
    'Q_N_8Q_HN': 'https://chartink.com/screener/q-n-8q-hn',
    'Q_N_9Q_HN': 'https://chartink.com/screener/q-n-9q-hn',
    'Q_N_10Q_HN': 'https://chartink.com/screener/q-n-10q-hn',
    'Q_N_11Q_HN': 'https://chartink.com/screener/q-n-11q-hn',
    'Q_N_12Q_HN': 'https://chartink.com/screener/q-n-12q-hn',
    'Y_N_4Y_HN': 'https://chartink.com/screener/y-n-4y-hn',
    'Y_N_5Y_HN': 'https://chartink.com/screener/y-n-5y-hn',
    'Y_N_6Y_HN': 'https://chartink.com/screener/y-n-6y-hn',
    'Y_N_7Y_HN': 'https://chartink.com/screener/y-n-7y-hn',
    'Y_N_8Y_HN': 'https://chartink.com/screener/y-n-8y-hn',
    'Y_N_9Y_HN': 'https://chartink.com/screener/y-n-9y-hn',
    'Y_N_10Y_HN': 'https://chartink.com/screener/y-n-10y-hn',
    'Y_N_11Y_HN': 'https://chartink.com/screener/y-n-11y-hn',
    'Y_N_12Y_HN': 'https://chartink.com/screener/y-n-12y-hn',

    # === NEAR TO BOTTOM RANGE ===
    'W_N_4W_LW': 'https://chartink.com/screener/w-n-4w-lw',
    'W_N_5W_LW': 'https://chartink.com/screener/w-n-5w-lw',
    'W_N_6W_LW': 'https://chartink.com/screener/w-n-6w-lw',
    'W_N_7W_LW': 'https://chartink.com/screener/w-n-7w-lw',
    'W_N_8W_LW': 'https://chartink.com/screener/w-n-8w-lw',
    'W_N_9W_LW': 'https://chartink.com/screener/w-n-9w-lw',
    'W_N_10W_LW': 'https://chartink.com/screener/w-n-10w-lw',
    'W_N_11W_LW': 'https://chartink.com/screener/w-n-11w-lw',
    'W_N_12W_LW': 'https://chartink.com/screener/w-n-12w-lw',
    'M_N_4M_LW': 'https://chartink.com/screener/m-n-4m-lw',
    'M_N_5M_LW': 'https://chartink.com/screener/m-n-5m-lw',
    'M_N_6M_LW': 'https://chartink.com/screener/m-n-6m-lw',
    'M_N_7M_LW': 'https://chartink.com/screener/m-n-7m-lw',
    'M_N_8M_LW': 'https://chartink.com/screener/m-n-8m-lw',
    'M_N_9M_LW': 'https://chartink.com/screener/m-n-9m-lw',
    'M_N_10M_LW': 'https://chartink.com/screener/m-n-10m-lw',
    'M_N_11M_LW': 'https://chartink.com/screener/m-n-11m-lw',
    'M_N_12M_LW': 'https://chartink.com/screener/m-n-12m-lw',
    'Q_N_4Q_LW': 'https://chartink.com/screener/q-n-4q-lw',
    'Q_N_5Q_LW': 'https://chartink.com/screener/q-n-5q-lw',
    'Q_N_6Q_LW': 'https://chartink.com/screener/q-n-6q-lw',
    'Q_N_7Q_LW': 'https://chartink.com/screener/q-n-7q-lw',
    'Q_N_8Q_LW': 'https://chartink.com/screener/q-n-8q-lw',
    'Q_N_9Q_LW': 'https://chartink.com/screener/q-n-9q-lw',
    'Q_N_10Q_LW': 'https://chartink.com/screener/q-n-10q-lw',
    'Q_N_11Q_LW': 'https://chartink.com/screener/q-n-11q-lw',
    'Q_N_12Q_LW': 'https://chartink.com/screener/q-n-12q-lw',
    'Y_N_4Y_LW': 'https://chartink.com/screener/y-n-4y-lw',
    'Y_N_5Y_LW': 'https://chartink.com/screener/y-n-5y-lw',
    'Y_N_6Y_LW': 'https://chartink.com/screener/y-n-6y-lw',
    'Y_N_7Y_LW': 'https://chartink.com/screener/y-n-7y-lw',
    'Y_N_8Y_LW': 'https://chartink.com/screener/y-n-8y-lw',
    'Y_N_9Y_LW': 'https://chartink.com/screener/y-n-9y-lw',
    'Y_N_10Y_LW': 'https://chartink.com/screener/y-n-10y-lw',
    'Y_N_11Y_LW': 'https://chartink.com/screener/y-n-11y-lw',
    'Y_N_12Y_LW': 'https://chartink.com/screener/y-n-12y-lw',

    # === BREAKDOWN ===
    'W_NR_4W_BD': 'https://chartink.com/screener/w-nr-4w-bd',
    'W_NR_5W_BD': 'https://chartink.com/screener/w-nr-5w-bd',
    'W_NR_6W_BD': 'https://chartink.com/screener/w-nr-6w-bd',
    'W_NR_7W_BD': 'https://chartink.com/screener/w-nr-7w-bd',
    'W_NR_8W_BD': 'https://chartink.com/screener/w-nr-8w-bd',
    'W_NR_9W_BD': 'https://chartink.com/screener/w-nr-9w-bd',
    'W_NR_10W_BD': 'https://chartink.com/screener/w-nr-10w-bd',
    'W_NR_11W_BD': 'https://chartink.com/screener/w-nr-11w-bd',
    'W_NR_12W_BD': 'https://chartink.com/screener/w-nr-12w-bd',
    'M_N_4M_BD': 'https://chartink.com/screener/m-n-4m-bd',
    'M_N_5M_BD': 'https://chartink.com/screener/m-n-5m-bd',
    'M_N_6M_BD': 'https://chartink.com/screener/m-n-6m-bd',
    'M_N_7M_BD': 'https://chartink.com/screener/m-n-7m-bd',
    'M_N_8M_BD': 'https://chartink.com/screener/m-n-8m-bd',
    'M_N_9M_BD': 'https://chartink.com/screener/m-n-9m-bd',
    'M_N_10M_BD': 'https://chartink.com/screener/m-n-10m-bd',
    'M_N_11M_BD': 'https://chartink.com/screener/m-n-11m-bd',
    'M_N_12M_BD': 'https://chartink.com/screener/m-n-12m-bd',
    'Q_N_4Q_BD': 'https://chartink.com/screener/q-n-4q-bd',
    'Q_N_5Q_BD': 'https://chartink.com/screener/q-n-5q-bd',
    'Q_N_6Q_BD': 'https://chartink.com/screener/q-n-6q-bd',
    'Q_N_7Q_BD': 'https://chartink.com/screener/q-n-7q-bd',
    'Q_N_8Q_BD': 'https://chartink.com/screener/q-n-8q-bd',
    'Q_N_9Q_BD': 'https://chartink.com/screener/q-n-9q-bd',
    'Q_N_10Q_BD': 'https://chartink.com/screener/q-n-10q-bd',
    'Q_N_11Q_BD': 'https://chartink.com/screener/q-n-11q-bd',
    'Q_N_12Q_BD': 'https://chartink.com/screener/q-n-12q-bd',
    'Y_N_4Y_BD': 'https://chartink.com/screener/y-n-4y-bd',
    'Y_N_5Y_BD': 'https://chartink.com/screener/y-n-5y-bd',
    'Y_N_6Y_BD': 'https://chartink.com/screener/y-n-6y-bd',
    'Y_N_7Y_BD': 'https://chartink.com/screener/y-n-7y-bd',
    'Y_N_8Y_BD': 'https://chartink.com/screener/y-n-8y-bd',
    'Y_N_9Y_BD': 'https://chartink.com/screener/y-n-9y-bd',
    'Y_N_10Y_BD': 'https://chartink.com/screener/y-n-10y-bd',
    'Y_N_11Y_BD': 'https://chartink.com/screener/y-n-11y-bd',
    'Y_N_12Y_BD': 'https://chartink.com/screener/y-n-12y-bd',
    'D_N_4D_BD': 'https://chartink.com/screener/d-n-4d-bd',
    'D_N_5D_BD': 'https://chartink.com/screener/d-n-5d-bd',
    'D_N_6D_BD': 'https://chartink.com/screener/d-n-6d-bd',
    'D_N_7D_BD': 'https://chartink.com/screener/d-n-7d-bd',
    'D_N_8D_BD': 'https://chartink.com/screener/d-n-8d-bd',
    'D_N_9D_BD': 'https://chartink.com/screener/d-n-9d-bd',
    'D_N_10D_BD': 'https://chartink.com/screener/d-n-10d-bd',
    'D_N_11D_BD': 'https://chartink.com/screener/d-n-11d-bd',
    'D_N_12D_BD': 'https://chartink.com/screener/d-n-12d-bd',

    # === BOTTOM BREAK THEN BACK TO NR ===
    'W_NR_4W_B2NR': 'https://chartink.com/screener/w-nr-4w-b2nr',
    'W_NR_5W_B2NR': 'https://chartink.com/screener/w-nr-5w-b2nr',
    'W_NR_6W_B2NR': 'https://chartink.com/screener/w-nr-6w-b2nr',
    'W_NR_7W_B2NR': 'https://chartink.com/screener/w-nr-7w-b2nr',
    'W_NR_8W_B2NR': 'https://chartink.com/screener/w-nr-8w-b2nr',
    'W_NR_9W_B2NR': 'https://chartink.com/screener/w-nr-9w-b2nr',
    'W_NR_10W_B2NR': 'https://chartink.com/screener/w-nr-10w-b2nr',
    'W_NR_11W_B2NR': 'https://chartink.com/screener/w-nr-11w-b2nr',
    'W_NR_12W_B2NR': 'https://chartink.com/screener/w-nr-12w-b2nr',
    'M_N_4M_B2NR': 'https://chartink.com/screener/m-n-4m-b2n',
    'M_N_5M_B2NR': 'https://chartink.com/screener/m-n-5m-b2n',
    'M_N_6M_B2NR': 'https://chartink.com/screener/m-n-6m-b2n',
    'M_N_7M_B2NR': 'https://chartink.com/screener/m-n-7m-b2n',
    'M_N_8M_B2NR': 'https://chartink.com/screener/m-n-8m-b2n',
    'M_N_9M_B2NR': 'https://chartink.com/screener/m-n-9m-b2n',
    'M_N_10M_B2NR': 'https://chartink.com/screener/m-n-10m-b2n',
    'M_N_11M_B2NR': 'https://chartink.com/screener/m-n-11m-b2n',
    'M_N_12M_B2NR': 'https://chartink.com/screener/m-n-12m-b2n',
    'Q_N_4Q_B2NR': 'https://chartink.com/screener/q-n-4q-b2n',
    'Q_N_5Q_B2NR': 'https://chartink.com/screener/q-n-5q-b2n',
    'Q_N_6Q_B2NR': 'https://chartink.com/screener/q-n-6q-b2n',
    'Q_N_7Q_B2NR': 'https://chartink.com/screener/q-n-7q-b2n',
    'Q_N_8Q_B2NR': 'https://chartink.com/screener/q-n-8q-b2n',
    'Q_N_9Q_B2NR': 'https://chartink.com/screener/q-n-9q-b2n',
    'Q_N_10Q_B2NR': 'https://chartink.com/screener/q-n-10q-b2n',
    'Q_N_11Q_B2NR': 'https://chartink.com/screener/q-n-11q-b2n',
    'Q_N_12Q_B2NR': 'https://chartink.com/screener/q-n-12q-b2n',
    'Y_N_4Y_B2NR': 'https://chartink.com/screener/y-n-4y-b2n',
    'Y_N_5Y_B2NR': 'https://chartink.com/screener/y-n-5y-b2n',
    'Y_N_6Y_B2NR': 'https://chartink.com/screener/y-n-6y-b2n',
    'Y_N_7Y_B2NR': 'https://chartink.com/screener/y-n-7y-b2n',
    'Y_N_8Y_B2NR': 'https://chartink.com/screener/y-n-8y-b2n',
    'Y_N_9Y_B2NR': 'https://chartink.com/screener/y-n-9y-b2n',
    'Y_N_10Y_B2NR': 'https://chartink.com/screener/y-n-10y-b2n',
    'Y_N_11Y_B2NR': 'https://chartink.com/screener/y-n-11y-b2n',
    'Y_N_12Y_B2NR': 'https://chartink.com/screener/y-n-12y-b2n',
}

# NEW: Stock Category URLs for identifying liquid stocks
capital_urls = {
    'FNO': 'https://chartink.com/screener/fno-list-248',
    'Nifty_LargeCap_100': 'https://chartink.com/screener/nf-100',
    'Midcap_150': 'https://chartink.com/screener/midcap-150-71',
    'SmallCap_250': 'https://chartink.com/screener/smallcap-250-46',
    'MicroCap_250': 'https://chartink.com/screener/microcap-250-27',
    'Nifty_500': 'https://chartink.com/screener/nf-500-21'
}

# NEW: Master stock data table - ONLY this scanner uses the "Copy table" button
# (Sr, Stock Name, Symbol, Close, %change, Volume, Sector, Industry, Marketcap)
# Every other scanner (zone_urls, nr_urls, capital_urls) keeps using "Copy symbols" as before.
master_data_urls = {
    'All_Stocks_Master': 'https://chartink.com/screener/all-data-of-the-stock-2'
}



def get_symbols_via_copy_button(driver):
    """Click Copy button and intercept clipboard data"""
    try:
        print("  Checking if table has data...")

        try:
            rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
            if not rows or len(rows) == 0:
                print("  ⚠ No data in table - skipping")
                return None

            if len(rows) == 1:
                no_data_text = rows[0].text.lower()
                if 'no' in no_data_text or 'not found' in no_data_text or 'empty' in no_data_text:
                    print("  ⚠ Table shows 'no results' - skipping")
                    return None
        except Exception as e:
            print(f"  ⚠ Could not check table contents: {str(e)}")
            return None

        print("  Setting up clipboard interceptor...")

        clipboard_js = """
        window.clipboardData = null;

        const originalWriteText = navigator.clipboard.writeText;
        navigator.clipboard.writeText = function(text) {
            window.clipboardData = text;
            return originalWriteText.call(navigator.clipboard, text);
        };

        const originalExecCommand = document.execCommand;
        document.execCommand = function(command) {
            if (command === 'copy') {
                const selection = window.getSelection();
                if (selection) {
                    window.clipboardData = selection.toString();
                }
            }
            return originalExecCommand.apply(document, arguments);
        };
        """

        driver.execute_script(clipboard_js)
        time.sleep(1)

        try:
            copy_button = WebDriverWait(driver, 10).until(
                 EC.element_to_be_clickable((By.XPATH,
                    "//div[contains(@class, 'scan-results-toolbar-button')]//span[text()='Copy']/.."
                 ))
            )

            button_classes = copy_button.get_attribute("class")
            if "disabled" in button_classes.lower() or copy_button.get_attribute("disabled"):
                print("  ⚠ Copy button is disabled (no data) - skipping")
                return None

            if not copy_button.is_enabled():
                print("  ⚠ Copy button is not enabled - skipping")
                return None

        except TimeoutException:
            print("  ⚠ Copy button not found - skipping")
            return None

        print("  Clicking Copy button...")
        driver.execute_script("arguments[0].click();", copy_button)
        time.sleep(2)

        try:
            # Strategy 1: Find by text content 'symbols' anywhere in page
            symbols_button = None
            strategies = [
                "//span[contains(@class, 'hidden') and contains(@class, 'sm:inline') and text()='symbols']/..",
                "//span[text()='symbols']/..",
                "//*[contains(text(), 'symbols') and contains(@class, 'cursor-pointer')]",
                "//*[contains(text(), 'symbols') and (contains(@class, 'cursor') or contains(@class, 'click'))]",
                "//*[normalize-space(text())='symbols']",
            ]

            for strategy in strategies:
                try:
                    symbols_button = WebDriverWait(driver, 5).until(
                        EC.element_to_be_clickable((By.XPATH, strategy))
                    )
                    if symbols_button:
                        print(f"  ✓ Found symbols button using: {strategy}")
                        break
                except:
                    continue

            # Strategy 2: JavaScript fallback - find by innerText
            if not symbols_button:
                print("  Trying JS text search for symbols button...")
                symbols_button = driver.execute_script("""
                    var allElements = document.querySelectorAll('*');
                    for (var el of allElements) {
                        if (el.children.length === 0 &&
                            el.innerText &&
                            el.innerText.trim().toLowerCase() === 'symbols') {
                            return el.parentElement || el;
                        }
                    }
                    return null;
                """)

            if not symbols_button:
                print("  ⚠ 'symbols' option not found after all strategies")
                return None

            print("  Clicking 'symbols' option...")
            driver.execute_script("arguments[0].click();", symbols_button)
            time.sleep(2)

        except TimeoutException:
            print("  ⚠ 'symbols' option not found - may indicate no data")
            return None

        clipboard_data = driver.execute_script("return window.clipboardData;")

        if clipboard_data and clipboard_data.strip():
            print(f"  ✓ Retrieved {len(clipboard_data)} characters from clipboard")
            return clipboard_data
        else:
            print("  ⚠ Clipboard interception failed, trying alternative method...")

            try:
                clipboard_data = driver.execute_script("""
                    var inputs = document.querySelectorAll('input[type="text"], textarea');
                    for (var i = inputs.length - 1; i >= 0; i--) {
                        if (inputs[i].value && inputs[i].value.length > 10) {
                            return inputs[i].value;
                        }
                    }
                    return null;
                """)

                if clipboard_data:
                    print(f"  ✓ Retrieved data via alternative method")
                    return clipboard_data
            except:
                pass

            print("  ⚠ Could not retrieve clipboard data")
            return None

    except Exception as e:
        print(f"  ⚠ Error using copy button: {str(e)}")
        if "TimeoutException" not in str(type(e)):
            import traceback
            print(f"  Traceback: {traceback.format_exc()}")
        return None


def get_table_via_copy_button(driver):
    """
    Click 'Copy table' and intercept clipboard data.

    Used ONLY for the master 'all-data-of-the-stock-2' scanner. It grabs the
    full row per stock: Sr, Stock Name, Symbol, Close, %change, Volume, Sector,
    Industry, Marketcap - instead of just the bare symbol list.
    """
    try:
        print("  Checking if table has data...")

        try:
            rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
            if not rows or len(rows) == 0:
                print("  ⚠ No data in table - skipping")
                return None

            if len(rows) == 1:
                no_data_text = rows[0].text.lower()
                if 'no' in no_data_text or 'not found' in no_data_text or 'empty' in no_data_text:
                    print("  ⚠ Table shows 'no results' - skipping")
                    return None
        except Exception as e:
            print(f"  ⚠ Could not check table contents: {str(e)}")
            return None

        print("  Setting up clipboard interceptor...")

        clipboard_js = """
        window.clipboardData = null;

        const originalWriteText = navigator.clipboard.writeText;
        navigator.clipboard.writeText = function(text) {
            window.clipboardData = text;
            return originalWriteText.call(navigator.clipboard, text);
        };

        const originalExecCommand = document.execCommand;
        document.execCommand = function(command) {
            if (command === 'copy') {
                const selection = window.getSelection();
                if (selection) {
                    window.clipboardData = selection.toString();
                }
            }
            return originalExecCommand.apply(document, arguments);
        };
        """

        driver.execute_script(clipboard_js)
        time.sleep(1)

        # Step 1 (optional / non-fatal): some layouts require clicking a parent
        # 'Copy' toolbar button before 'symbols'/'table' options appear at all.
        try:
            copy_button = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.XPATH,
                    "//div[contains(@class, 'scan-results-toolbar-button')]//span[text()='Copy']/.."
                ))
            )
            button_classes = copy_button.get_attribute("class") or ""
            if "disabled" not in button_classes.lower() and not copy_button.get_attribute("disabled") and copy_button.is_enabled():
                print("  Clicking Copy button...")
                driver.execute_script("arguments[0].click();", copy_button)
                time.sleep(2)
        except TimeoutException:
            print("  (No separate 'Copy' trigger button found - 'table' option may already be visible)")

        # Step 2: click the 'table' option (the only real change vs. symbols flow)
        try:
            table_button = None
            strategies = [
                "//button[@aria-label='Copy table']",
                "//*[@aria-label='Copy table']",
                "//span[contains(@class,'hidden') and contains(@class,'sm:inline') and text()='table']/..",
                "//span[text()='table']/..",
                "//*[contains(text(), 'table') and contains(@class, 'cursor-pointer')]",
                "//*[normalize-space(text())='table']",
            ]

            for strategy in strategies:
                try:
                    table_button = WebDriverWait(driver, 5).until(
                        EC.element_to_be_clickable((By.XPATH, strategy))
                    )
                    if table_button:
                        print(f"  ✓ Found table button using: {strategy}")
                        break
                except:
                    continue

            if not table_button:
                print("  Trying JS text search for table button...")
                table_button = driver.execute_script("""
                    var allElements = document.querySelectorAll('*');
                    for (var el of allElements) {
                        if (el.children.length === 0 &&
                            el.innerText &&
                            el.innerText.trim().toLowerCase() === 'table') {
                            return el.closest('button') || el.parentElement || el;
                        }
                    }
                    return null;
                """)

            if not table_button:
                print("  ⚠ 'table' option not found after all strategies")
                return None

            print("  Clicking 'table' option...")
            driver.execute_script("arguments[0].click();", table_button)
            time.sleep(2)

        except TimeoutException:
            print("  ⚠ 'table' option not found - may indicate no data")
            return None

        clipboard_data = driver.execute_script("return window.clipboardData;")

        if clipboard_data and clipboard_data.strip():
            print(f"  ✓ Retrieved {len(clipboard_data)} characters from clipboard (table mode)")
            return clipboard_data
        else:
            print("  ⚠ Clipboard interception failed, trying alternative method...")
            try:
                clipboard_data = driver.execute_script("""
                    var inputs = document.querySelectorAll('input[type="text"], textarea');
                    for (var i = inputs.length - 1; i >= 0; i--) {
                        if (inputs[i].value && inputs[i].value.length > 10) {
                            return inputs[i].value;
                        }
                    }
                    return null;
                """)
                if clipboard_data:
                    print(f"  ✓ Retrieved data via alternative method")
                    return clipboard_data
            except:
                pass

            print("  ⚠ Could not retrieve table clipboard data")
            return None

    except Exception as e:
        print(f"  ⚠ Error using table copy button: {str(e)}")
        return None


def parse_symbols_from_clipboard(clipboard_data, key, output_list, stock_signal_map, lock=None):
    """Parse comma-separated symbols from clipboard data"""
    if not clipboard_data:
        return 0

    symbols = [s.strip() for s in clipboard_data.split(',') if s.strip()]

    processed_count = 0
    for symbol in symbols:
        if symbol and not any(word.lower() in symbol.lower() for word in exclude_words):
            formatted_symbol = f"NSE:{symbol},"
            print(f"  Found: {formatted_symbol}")

            if lock:
                with lock:
                    output_list.append(formatted_symbol)
                    if symbol not in stock_signal_map:
                        stock_signal_map[symbol] = []
                    stock_signal_map[symbol].append(key)
            else:
                output_list.append(formatted_symbol)
                if symbol not in stock_signal_map:
                    stock_signal_map[symbol] = []
                stock_signal_map[symbol].append(key)

            processed_count += 1

    return processed_count


def _row_to_record(cells):
    """
    Map one master-table row to a dict.
    Expected column order: Sr, Stock Name, Symbol, Close, %change, Volume, Sector, Industry, Marketcap
    """
    cells = list(cells)
    if len(cells) < 8:
        return None
    if len(cells) < 9:
        cells.append('Unknown')

    sr, stock_name, symbol, price, change_pct, volume, sector, industry, marketcap = cells[:9]

    symbol = symbol.strip().upper()
    if not symbol:
        return None

    def to_float(val, default=0.0):
        try:
            return float(str(val).replace(',', '').replace('%', '').strip())
        except (ValueError, TypeError):
            return default

    def to_int(val, default=0):
        try:
            return int(str(val).replace(',', '').strip())
        except (ValueError, TypeError):
            return default

    def clean_label(val):
        v = (val or '').strip()
        if not v or v.lower() in ('n/a', 'na', '-', 'none'):
            return 'Unknown'
        return v.title()

    return {
        'Sr': to_int(sr),
        'Stock_Name': stock_name.strip(),
        'Symbol': symbol,
        'Price': to_float(price),
        'Change_Pct': to_float(change_pct),
        'Volume': to_int(volume),
        'Sector': clean_label(sector),
        'Industry': clean_label(industry),
        'Marketcap': clean_label(marketcap),
    }


def parse_master_table_clipboard(clipboard_data):
    """
    Parse the 'Copy table' clipboard output from the master 'all-data-of-the-stock-2' scanner.
    Handles TSV rows and flattened (one cell per line) clipboard shapes.
    Returns a list of dicts (see _row_to_record for the schema).
    """
    if not clipboard_data:
        return []

    raw_lines = [ln.strip() for ln in clipboard_data.replace('\r\n', '\n').replace('\r', '\n').split('\n')]
    lines = [ln for ln in raw_lines if ln != '']

    header_markers = {
        'sr', 'sr.', 'stock name', 'symbol', 'price', 'close', 'volume', 'sector',
        'industry', 'marketcap', 'market cap', '% chg', '%change', '%_change', 'change', 'ltp'
    }

    def is_header_like(line):
        low = line.lower().strip()
        if low in header_markers:
            return True
        if low.startswith('sort table by'):
            return True
        return False

    # --- Strategy 1: tab-separated, one full row per line ---
    tab_lines = [ln for ln in lines if '\t' in ln]
    if tab_lines:
        records = []
        for ln in lines:
            if '\t' not in ln:
                continue
            cells = [c.strip() for c in ln.split('\t')]
            if not cells or not cells[0] or is_header_like(cells[0]):
                continue
            if not cells[0].replace(',', '').isdigit():
                continue
            rec = _row_to_record(cells)
            if rec:
                records.append(rec)
        if records:
            return records

    # --- Strategy 2: flattened, one cell per line -> chunk into groups of 9 (or 8) ---
    filtered = [ln for ln in lines if not is_header_like(ln)]

    start = 0
    while start < len(filtered) and not filtered[start].replace(',', '').isdigit():
        start += 1
    filtered = filtered[start:]

    best_records = []
    for chunk_size in (9, 8):
        records = []
        broken = False
        for i in range(0, len(filtered) - chunk_size + 1, chunk_size):
            chunk = filtered[i:i + chunk_size]
            if not chunk[0].replace(',', '').isdigit():
                broken = True
                break
            rec = _row_to_record(chunk)
            if rec:
                records.append(rec)
        if not broken and len(records) > len(best_records):
            best_records = records

    return best_records


def scrape_url_via_copy(driver, url, key, output_list, stock_signal_map, lock=None):
    """Scrape URL using Copy button method"""
    try:
        print(f"\n➤ Processing: {key}")
        print(f"  URL: {url}")

        driver.get(url)
        time.sleep(6)

        if lock:
            with lock:
                output_list.append(f"__NSE:{key},")
        else:
            output_list.append(f"__NSE:{key},")

        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody"))
            )
            time.sleep(2)
        except TimeoutException:
            print(f"  ⚠ Table not found for {key}")
            return

        clipboard_data = get_symbols_via_copy_button(driver)

        if clipboard_data:
            processed = parse_symbols_from_clipboard(clipboard_data, key, output_list, stock_signal_map, lock)
            print(f"  ✓ Extracted {processed} stocks from ALL pages")

            if processed == 0:
                print(f"  ⚠ WARNING: No valid stocks found for {key}")
        else:
            print(f"  ⚠ Failed to get clipboard data for {key}")

    except Exception as e:
        print(f"  ✗ Error processing {key}: {str(e)}")


def scrape_urls_batch(urls_dict, phase_name, restart_every=25):
    """Scrape a batch of URLs, restarting the browser periodically and recovering from hangs"""
    driver = None
    output = []
    stock_signal_map = {}

    try:
        print(f"\n{'*'*60}")
        print(f"STARTING {phase_name}")
        print(f"{'*'*60}")

        driver = setup_driver()
        count_since_restart = 0

        for key, url in urls_dict.items():
            try:
                scrape_url_via_copy(driver, url, key, output, stock_signal_map)
            except Exception as e:
                print(f"  ✗ Hard failure on {key}, restarting browser: {str(e)}")
                try:
                    driver.quit()
                except:
                    pass
                driver = setup_driver()
                count_since_restart = 0
                continue

            count_since_restart += 1
            if count_since_restart >= restart_every:
                print(f"  ↻ Restarting browser after {restart_every} URLs (memory hygiene)")
                try:
                    driver.quit()
                except:
                    pass
                driver = setup_driver()
                count_since_restart = 0

        print(f"\n✓ {phase_name} COMPLETED")
        return output, stock_signal_map

    except Exception as e:
        print(f"✗ Error in {phase_name}: {str(e)}")
        return output, stock_signal_map

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass

def scrape_category_stocks(urls_dict):
    """Scrape stock category lists (FNO, Nifty 100, etc.)"""
    driver = None
    category_stocks = {}

    try:
        print(f"\n{'*'*60}")
        print(f"SCRAPING STOCK CATEGORIES")
        print(f"{'*'*60}")

        driver = setup_driver()

        for category, url in urls_dict.items():
            print(f"\n➤ Processing Category: {category}")
            print(f"  URL: {url}")

            driver.get(url)
            time.sleep(6)

            try:
                WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody"))
                )
                time.sleep(2)
            except TimeoutException:
                print(f"  ⚠ Table not found for {category}")
                continue

            clipboard_data = get_symbols_via_copy_button(driver)

            if clipboard_data:
                symbols = [s.strip() for s in clipboard_data.split(',') if s.strip()]
                filtered_symbols = [s for s in symbols if not any(word.lower() in s.lower() for word in exclude_words)]
                category_stocks[category] = set(filtered_symbols)
                print(f"  ✓ Found {len(filtered_symbols)} stocks in {category}")
            else:
                category_stocks[category] = set()
                print(f"  ⚠ No data for {category}")

        print(f"\n✓ STOCK CATEGORIES SCRAPING COMPLETED")
        return category_stocks

    except Exception as e:
        print(f"✗ Error scraping categories: {str(e)}")
        return category_stocks

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def scrape_master_stock_data(urls_dict):
    """
    Scrape the master stock data table(s) using the 'Copy table' button (NOT 'Copy symbols').
    Only master_data_urls (currently just 'all-data-of-the-stock-2') should be passed here.
    Returns:
        master_data     - dict: Symbol -> record (Stock_Name, Price, Change_Pct, Volume,
                                 Sector, Industry, Marketcap)
        all_records     - list of the same records, for dumping to a raw reference sheet
    """
    driver = None
    master_data = {}
    all_records = []

    try:
        print(f"\n{'*'*60}")
        print("SCRAPING MASTER STOCK DATA (Sector / Industry / Marketcap table)")
        print(f"{'*'*60}")

        driver = setup_driver()

        for key, url in urls_dict.items():
            print(f"\n➤ Processing Master Table: {key}")
            print(f"  URL: {url}")

            driver.get(url)
            time.sleep(6)

            try:
                WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody"))
                )
                time.sleep(2)
            except TimeoutException:
                print(f"  ⚠ Table not found for {key}")
                continue

            clipboard_data = get_table_via_copy_button(driver)

            if clipboard_data:
                records = parse_master_table_clipboard(clipboard_data)
                print(f"  ✓ Parsed {len(records)} stock records from {key}")

                if not records:
                    debug_path = f"master_table_debug_{key}.txt"
                    try:
                        with open(debug_path, 'w', encoding='utf-8') as f:
                            f.write(clipboard_data)
                        print(f"  ⚠ 0 records parsed - raw clipboard saved to {debug_path} for debugging")
                    except Exception:
                        pass

                for rec in records:
                    master_data[rec['Symbol']] = rec
                    all_records.append(rec)
            else:
                print(f"  ⚠ No table data retrieved for {key}")

        print(f"\n✓ MASTER STOCK DATA SCRAPING COMPLETED — {len(master_data)} unique symbols")
        return master_data, all_records

    except Exception as e:
        print(f"✗ Error scraping master stock data: {str(e)}")
        return master_data, all_records

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass



# ============================================================================
# ============================================================================
#   FAST ENGINE  —  4 raw-data scrapes + Python calculation
# ============================================================================
# ============================================================================

# (all settings, URLs and rules are in the SETTINGS section at the top of this file)

TF_ZONE_PREFIX = {'d': 'daily', 'w': 'weekly', 'm': 'monthly', 'q': 'quaterly', 'y': 'yearly'}
TF_PREV_CLOSE = {'d': '1_day_ago_close', 'w': '1_week_ago_close', 'm': '1_month_ago_close',
                 'q': '1_quater_ago_close', 'y': '1_year_ago_close'}
TEXT_COLUMNS = {'sr', 'stock_name', 'symbol', 'sector', 'industry', 'marketcap'}


# ------------------------------------------------------------- table parse --
def _norm_header(h):
    """'1_quater_ago_close' / 'Stock Name' / '%_change' / 'Sr.' -> stable snake_case keys."""
    h = str(h).strip().lower()
    h = h.replace('quarterly', 'quaterly').replace('quarter', 'quater')
    h = re.sub(r'[^a-z0-9%]+', '_', h).strip('_')
    aliases = {
        'sr': 'sr', 'sr_no': 'sr', 'name': 'stock_name', 'stock': 'stock_name',
        '%_change': 'pct_change', '%change': 'pct_change', '%_chg': 'pct_change', '%chg': 'pct_change',
        'change': 'pct_change', 'price': 'close', 'ltp': 'close',
    }
    return aliases.get(h, h)


def parse_wide_table_clipboard(clipboard_data):
    """
    Parse a Chartink 'Copy table' clipboard (tab separated, first line = header) into a DataFrame.
    Works for the 100+ column raw-data tables. Blank cells stay blank (NaN after conversion).
    """
    if not clipboard_data:
        return pd.DataFrame()
    lines = clipboard_data.replace('\r\n', '\n').replace('\r', '\n').split('\n')

    header_idx = None
    for i, ln in enumerate(lines):
        cells = [c.strip().lower() for c in ln.split('\t')]
        if '\t' in ln and 'symbol' in cells:
            header_idx = i
            break
    if header_idx is None:
        return pd.DataFrame()

    header = [_norm_header(c) for c in lines[header_idx].split('\t')]
    keep = [i for i, h in enumerate(header) if h and h not in ('add_column',)]
    names = []
    for i in keep:                                  # make duplicate headers unique
        n, k = header[i], 2
        while n in names:
            n = f"{header[i]}_{k}"; k += 1
        names.append(n)

    rows = []
    for ln in lines[header_idx + 1:]:
        if not ln.strip() or '\t' not in ln:
            continue
        cells = ln.split('\t')
        if len(cells) < len(header):
            cells += [''] * (len(header) - len(cells))
        rows.append([cells[i].strip() for i in keep])

    df = pd.DataFrame(rows, columns=names)
    if 'symbol' in df.columns:
        df['symbol'] = df['symbol'].astype(str).str.strip().str.upper()
        df = df[df['symbol'] != ''].drop_duplicates('symbol', keep='first')
    return df.reset_index(drop=True)


def read_table_from_dom(driver, max_pages=200):
    """
    Fallback when 'Copy table' fails: read header + rows straight from the page,
    clicking through pagination if there is any. Returns TSV text in the same shape
    as the clipboard, so the normal parser can be reused.
    """
    js_read = """
        const t = document.querySelector('table');
        if (!t) return null;
        const head = [...t.querySelectorAll('thead th')].map(th => th.innerText.trim());
        const rows = [...t.querySelectorAll('tbody tr')].map(tr =>
            [...tr.querySelectorAll('td')].map(td => td.innerText.trim()));
        return {head: head, rows: rows};
    """
    js_next = """
        const cands = [...document.querySelectorAll('button, a, li, span')].filter(el => {
            const t = (el.innerText || '').trim().toLowerCase();
            const a = (el.getAttribute('aria-label') || '').toLowerCase();
            return (t === 'next' || t === '›' || t === '»' || a.includes('next page') || a === 'next');
        });
        for (const el of cands) {
            const dis = el.disabled || el.classList.contains('disabled') ||
                        el.getAttribute('aria-disabled') === 'true' ||
                        (el.parentElement && el.parentElement.classList.contains('disabled'));
            if (!dis) { el.click(); return true; }
        }
        return false;
    """
    header, all_rows, seen_first = None, [], set()
    for _ in range(max_pages):
        data = driver.execute_script(js_read)
        if not data or not data.get('rows'):
            break
        header = header or data['head']
        first = '\t'.join(data['rows'][0])
        if first in seen_first:
            break
        seen_first.add(first)
        all_rows.extend(data['rows'])
        if not driver.execute_script(js_next):
            break
        time.sleep(1.5)
    if not header:
        return None
    return '\n'.join(['\t'.join(header)] + ['\t'.join(r) for r in all_rows])


def scrape_raw_tables(urls_dict, snapshot_dir=None):
    """Scrape the 4 raw-data screeners with 'Copy table'. Returns {key: clipboard TSV text}."""
    driver = None
    texts = {}
    try:
        print(f"\n{'*'*60}")
        print("SCRAPING RAW DATA TABLES (4 pages replace ~300 screeners)")
        print(f"{'*'*60}")
        driver = setup_driver()

        for key, url in urls_dict.items():
            text = None
            for attempt in (1, 2):
                try:
                    print(f"\n➤ Raw table: {key} (attempt {attempt})")
                    print(f"  URL: {url}")
                    driver.get(url)
                    time.sleep(8)
                    WebDriverWait(driver, 40).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr"))
                    )
                    time.sleep(3)

                    text = get_table_via_copy_button(driver)
                    df_try = parse_wide_table_clipboard(text) if text else pd.DataFrame()
                    min_rows = MIN_EXPECTED_ROWS.get(key, 100)
                    if len(df_try) < min_rows:
                        print(f"  ⚠ Copy table gave {len(df_try)} rows — trying DOM fallback")
                        dom_text = read_table_from_dom(driver)
                        df_dom = parse_wide_table_clipboard(dom_text) if dom_text else pd.DataFrame()
                        if len(df_dom) > len(df_try):
                            text, df_try = dom_text, df_dom

                    if len(df_try) >= min_rows:
                        print(f"  ✓ {key}: {len(df_try)} rows × {len(df_try.columns)} columns")
                        break
                    print(f"  ⚠ Only {len(df_try)} rows for {key}")
                    text = None
                except Exception as e:
                    print(f"  ⚠ Error on {key}: {str(e)[:200]}")
                    text = None
                    try:
                        driver.quit()
                    except Exception:
                        pass
                    driver = setup_driver()

            if not text:
                if key in OPTIONAL_RAW_TABLES:
                    print(f"  ⚠ Optional raw table '{key}' could not be scraped — continuing without it")
                    continue
                raise Exception(f"Raw table '{key}' could not be scraped")
            texts[key] = text
            if snapshot_dir:
                with open(os.path.join(snapshot_dir, f"{key}.tsv"), 'w', encoding='utf-8') as f:
                    f.write(text)

        print(f"\n✓ RAW DATA TABLES SCRAPED")
        return texts
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def _to_num(series):
    s = series.astype(str).str.replace(',', '', regex=False).str.replace('%', '', regex=False).str.strip()
    s = s.where(~s.str.lower().isin(['', 'nan', 'none', '-', 'n/a', 'na']), None)
    return pd.to_numeric(s, errors='coerce')


_VZ_HDR = re.compile(r'^(daily|weekly|monthly|quaterly|yearly)(?:_(\d+))?_(top|bottom)_zone(?:_\d+)?$')
_VZ_TF = {'daily': 'd', 'weekly': 'w', 'monthly': 'm', 'quaterly': 'q', 'yearly': 'y'}


def normalize_virgin_frame(df):
    """
    virgin-data columns -> vz_<tf><offset>_<top|bottom>   (e.g. vz_y3_bottom = 3 years ago bottom_zone).
    Offsets are assigned by POSITION inside each timeframe/side group (0,1,2,3,4), so a mistyped header
    such as a second 'weekly_3_bottom_zone' (really 4 weeks ago) is still read correctly.
    """
    if df.empty:
        return df
    counters, rename = defaultdict(int), {}
    for c in df.columns:
        m = _VZ_HDR.match(c)
        if not m:
            continue
        tf, side = _VZ_TF[m.group(1)], m.group(3)
        k = counters[(tf, side)]
        counters[(tf, side)] += 1
        labelled = int(m.group(2)) if m.group(2) is not None else 0
        if labelled != k:
            print(f"  ⚠ virgin-data header '{c}' sits in position {k} of the {m.group(1)} {side} group — read as {k} bars ago")
        rename[c] = f"vz_{tf}{k}_{side}"
    keep = ['symbol'] + list(rename.keys())
    return df[keep].rename(columns=rename)


# technical-data columns -> tech_<tf>_<rsi|adx|bbu|bbl|macd|st|cci>
_TECH_HDR = re.compile(r'^(d|w|m|q|y|daily|weekly|monthly|quaterly|yearly)_(.+)$')
_TECH_KEYS = (('upper', 'bbu'), ('lower', 'bbl'), ('macd', 'macd'), ('super', 'st'), ('cci', 'cci'), ('rsi', 'rsi'), ('adx', 'adx'))
TECH_INDICATORS = ('rsi', 'adx', 'bbu', 'bbl', 'macd', 'st', 'cci')


def normalize_technical_frame(df):
    if df.empty:
        return df
    rename = {}
    for c in df.columns:
        m = _TECH_HDR.match(c)
        if not m:
            continue
        tf = _VZ_TF.get(m.group(1), m.group(1))
        ind = next((k for word, k in _TECH_KEYS if word in m.group(2)), None)
        name = f"tech_{tf}_{ind}" if ind else None
        if name and name not in rename.values():
            rename[c] = name
    print(f"  • technicals: {len(rename)} indicator columns recognised")
    return df[['symbol'] + list(rename.keys())].rename(columns=rename)


def build_market_frame(raw_texts):
    """Merge the 4 raw tables on Symbol into one numeric frame (one row per stock)."""
    frames = {k: parse_wide_table_clipboard(v) for k, v in raw_texts.items()}
    for k, f in frames.items():
        print(f"  • {k}: {len(f)} rows, {len(f.columns)} columns")

    base = frames.get('daily_zones', pd.DataFrame())
    if base.empty:
        raise Exception("raw-data-5 table is empty — cannot calculate signals")

    if 'virgin_zones' in frames:
        frames['virgin_zones'] = normalize_virgin_frame(frames['virgin_zones'])
    if 'technicals' in frames:
        tech = normalize_technical_frame(frames['technicals'])
        if not tech.empty:
            base = base.merge(tech, on='symbol', how='left')        # technicals never add stocks

    for key in ('week_month', 'quarter_year', 'virgin_zones'):
        other = frames.get(key, pd.DataFrame())
        if other.empty:
            print(f"  ⚠ {key} table empty — its timeframes will produce no signals")
            continue
        extra = [c for c in other.columns if c not in base.columns or c == 'symbol']
        base = base.merge(other[extra], on='symbol', how='outer')      # keep stocks present in only one table
        if 'stock_name' in other.columns and 'stock_name' in base.columns:
            names = other.set_index('symbol')['stock_name']
            base['stock_name'] = base['stock_name'].fillna(base['symbol'].map(names))

    for c in base.columns:
        if c not in TEXT_COLUMNS:
            base[c] = _to_num(base[c])

    required = ['close'] + [f"{p}_{z}" for p in TF_ZONE_PREFIX.values()
                            for z in ('top_zone', 'top_near', 'bottom_zone', 'bottom_near')]
    missing = [c for c in required if c not in base.columns]
    if missing:
        print(f"  ⚠ Missing columns (signals using them will be empty): {missing}")
    return base.reset_index(drop=True)


# ------------------------------------------------------------ calculations --
class _Ctx:
    """Vector helpers over the merged frame. NaN compares False, so missing data never fires a signal."""

    def __init__(self, df, category_stocks=None):
        self.df = df
        self.n = len(df)
        self.c = self.col('close')
        n500 = (category_stocks or {}).get('Nifty_500', set())
        self.has_n500 = bool(n500)
        self.nifty500 = df['symbol'].isin(n500).to_numpy() if n500 else np.ones(self.n, dtype=bool)
        self.z = {}
        for tf, p in TF_ZONE_PREFIX.items():
            tz, tn = self.col(f"{p}_top_zone"), self.col(f"{p}_top_near")
            bz, bn = self.col(f"{p}_bottom_zone"), self.col(f"{p}_bottom_near")
            self.z[tf] = {
                'tz': np.maximum(tz, tn), 'tn': np.minimum(tz, tn),   # top band    = [tn .. tz]
                'bz': np.minimum(bz, bn), 'bn': np.maximum(bz, bn),   # bottom band = [bz .. bn]
            }

    def col(self, name):
        if name in self.df.columns:
            return self.df[name].to_numpy(dtype=float)
        return np.full(self.n, np.nan)

    def vzone(self, tf, side, i):
        """Zone of the bar i periods ago, from virgin-data (offset 0 falls back to raw-data-5)."""
        v = self.col(f"vz_{tf}{i}_{side}")
        if i == 0:
            fallback = self.z[tf]['tz'] if side == 'top' else self.z[tf]['bz']
            v = np.where(np.isnan(v), fallback, v)
        return v

    def prev(self, tf):
        return self.col(TF_PREV_CLOSE[tf])

    def ohlc(self, tf, field, i):
        return self.col(f"{tf}{i if i else ''}_{field}")

    def ohlc_matrix(self, tf, field, upto=12):
        return np.column_stack([self.ohlc(tf, field, i) for i in range(upto + 1)])

    # zone helpers
    def top(self, tf):
        return self.z[tf]['tn'], self.z[tf]['tz']

    def bottom(self, tf):
        return self.z[tf]['bz'], self.z[tf]['bn']

    def in_band(self, band):
        lo, hi = band
        return (self.c >= lo) & (self.c <= hi)

    @staticmethod
    def overlap(a, b):
        return np.maximum(a[0], b[0]) <= np.minimum(a[1], b[1])

    def cross_up(self, level, tf):
        return (self.c > level) & (self.prev(tf) <= level)

    def cross_dn(self, level, tf):
        return (self.c < level) & (self.prev(tf) >= level)


def _zone_rules():
    """
    One rule per zone signal name (same names as zone_urls, so every sheet stays identical).
    Zone vocabulary (from raw-data-5):
        <tf>_top_zone    = TOP of the zone          <tf>_top_near    = lower edge of the top band
        <tf>_bottom_zone = BOTTOM of the zone       <tf>_bottom_near = upper edge of the bottom band
        "Zone High / Top"  -> top_zone        "Zone Low" -> bottom_zone
        "Near X"           -> close inside X's band   (top band = top_near..top_zone,
                                                        bottom band = bottom_zone..bottom_near)
        "Overlap a/b"      -> see the OVERLAP / RETRACEMENT rule in the SETTINGS section
    """
    R = {}

    # === LONG SIGNALS ===
    R['Daily_Close_Above_Monthly_Zone'] = lambda x: x.c > x.z['m']['tz']
    R['Daily_Close_Crossed_Above_Monthly_Zone'] = lambda x: x.cross_up(x.z['m']['tz'], 'd')
    R['Weekly_Close_Crossed_Above_Monthly_Zone'] = lambda x: x.cross_up(x.z['m']['tz'], 'w')
    R['Near_Monthly_Zone_Top'] = lambda x: x.in_band(x.top('m'))
    R['Close_Above_Weekly_Zone_Below_Monthly_Zone'] = lambda x: (x.c > x.z['w']['tz']) & (x.c < x.z['m']['tn'])
    R['Daily_Close_Crossed_Above_Weekly_Zone_Below_Monthly_Zone'] = lambda x: x.cross_up(x.z['w']['tz'], 'd') & (x.c < x.z['m']['tz'])
    R['Weekly_Close_Crossed_Above_Weekly_Zone_Below_Monthly_Zone'] = lambda x: x.cross_up(x.z['w']['tz'], 'w') & (x.c < x.z['m']['tz'])
    R['Daily_Close_Above_Quarterly_Zone'] = lambda x: x.c > x.z['q']['tz']
    R['Quarterly_Close_Above_Monthly_Zone_Below_Quarterly_Zone'] = lambda x: (x.c > x.z['m']['tz']) & (x.c < x.z['q']['tz'])
    R['Quarterly_Close_Crossed_Above_Monthly_Zone_Below_Quarterly_Zone'] = lambda x: x.cross_up(x.z['m']['tz'], 'q') & (x.c < x.z['q']['tz'])
    R['Weekly_Close_Crossed_Above_Monthly_Zone_Below_Quarterly_Zone'] = lambda x: x.cross_up(x.z['m']['tz'], 'w') & (x.c < x.z['q']['tz'])

    # === SHORT SIGNALS ===
    R['Daily_Close_Below_Monthly_Zone_Low'] = lambda x: x.c < x.z['m']['bz']
    R['Daily_Close_Crossed_Below_Monthly_Zone_Low'] = lambda x: x.cross_dn(x.z['m']['bz'], 'd')
    R['Weekly_Close_Crossed_Below_Monthly_Zone_Low'] = lambda x: x.cross_dn(x.z['m']['bz'], 'w')
    R['Near_Monthly_Zone_Low'] = lambda x: x.in_band(x.bottom('m'))
    R['Daily_Close_Below_Weekly_Zone_Above_Monthly_Zone_Low'] = lambda x: (x.c < x.z['w']['bz']) & (x.c > x.z['m']['bn'])
    R['Daily_Close_Crossed_Below_Weekly_Zone_Above_Monthly_Zone_Low'] = lambda x: x.cross_dn(x.z['w']['bz'], 'd') & (x.c > x.z['m']['bz'])
    R['Weekly_Close_Crossed_Below_Weekly_Zone_Above_Monthly_Zone_Low'] = lambda x: x.cross_dn(x.z['w']['bz'], 'w') & (x.c > x.z['m']['bz'])
    R['Daily_Close_Below_Quarterly_Zone_Low'] = lambda x: x.c < x.z['q']['bz']
    R['Daily_Close_Below_Monthly_Zone_Above_Quarterly_Zone'] = lambda x: (x.c < x.z['m']['bz']) & (x.c > x.z['q']['bz'])
    R['Daily_Close_Crossed_Below_Monthly_Zone_Above_Quarterly_Zone'] = lambda x: x.cross_dn(x.z['m']['bz'], 'd') & (x.c > x.z['q']['bz'])
    R['Weekly_Close_Crossed_Below_Monthly_Zone_Above_Quarterly_Zone'] = lambda x: x.cross_dn(x.z['m']['bz'], 'w') & (x.c > x.z['q']['bz'])

    # === DAILY ZONE ===
    R['Daily_Close_Above_Daily_Zone_High'] = lambda x: x.c > x.z['d']['tz']
    R['Daily_Close_Below_Daily_Zone_Low'] = lambda x: x.c < x.z['d']['bz']
    R['Daily_Close_Above_Weekly_Zone_High_Below_Monthly_Zone_High'] = lambda x: (x.c > x.z['w']['tz']) & (x.c < x.z['m']['tz'])
    R['Daily_Close_Below_Weekly_Zone_Low_Above_Monthly_Zone_Low'] = lambda x: (x.c < x.z['w']['bz']) & (x.c > x.z['m']['bz'])
    R['Daily_Close_Above_Weekly_Zone_High'] = lambda x: x.c > x.z['w']['tz']
    R['Daily_Close_Below_Weekly_Zone_Low'] = lambda x: x.c < x.z['w']['bz']
    R['Daily_Close_Near_Daily_Zone_High'] = lambda x: x.in_band(x.top('d'))
    R['Daily_Close_Near_Daily_Zone_Low'] = lambda x: x.in_band(x.bottom('d'))

    # === OVERLAPPING ZONES — near the stacked band ===
    def near_stacked_support(a, b):        # both bottom bands overlap, close sits on/above the stack
        def f(x):
            A, B = x.bottom(a), x.bottom(b)
            lo = np.maximum(A[0], B[0])
            hi = np.maximum(A[1], B[1])
            return x.overlap(A, B) & (x.c >= lo) & (x.c <= hi)
        return f

    def near_stacked_resistance(a, b):     # both top bands overlap, close sits just under/in the stack
        def f(x):
            A, B = x.top(a), x.top(b)
            lo = np.minimum(A[0], B[0])
            hi = np.minimum(A[1], B[1])
            return x.overlap(A, B) & (x.c >= lo) & (x.c <= hi)
        return f

    R['Daily_Close_Near_and_abv_Overlap_Weekly_Monthly_Zone_Low'] = near_stacked_support('w', 'm')
    R['Daily_Close_Near_and_blw_Overlap_Weekly_Monthly_Zone_High'] = near_stacked_resistance('w', 'm')
    R['Daily_Close_Near_and_abv_Overlap_monthly_quaterly_Zone_Low'] = near_stacked_support('m', 'q')
    R['Daily_Close_Near_and_blw_Overlap_Monthly_quaterly_Zone_High'] = near_stacked_resistance('m', 'q')
    R['Daily_Close_Near_and_abv_Overlap_monthly_yearly_Zone_Low'] = near_stacked_support('m', 'y')
    R['Daily_Close_Near_and_blw_Overlap_Monthly_yearly_Zone_High'] = near_stacked_resistance('m', 'y')

    # === OVERLAPPING ZONES — exactly as your Chartink scans ===
    # W_CLOSE_BLW_M_Z_LOW_OVERLAP_MZL_YZH (screenshot):
    #     Monthly bottom_zone <= Yearly top_zone
    #     Monthly bottom_zone >= Yearly top_near         -> M zone LOW sits INSIDE the Y top band
    #     Weekly Close crossed below Monthly bottom_zone  -> break of the M zone low itself
    # The "above" versions are the mirror:
    #     <a> top_zone >= <b> bottom_zone  and  <a> top_zone <= <b> bottom_near
    #     close above <a> top_zone
    def low_in_top_band(x, a, b):       # <a> bottom_zone inside <b> top band  [top_near .. top_zone]
        return (x.z[a]['bz'] <= x.z[b]['tz']) & (x.z[a]['bz'] >= x.z[b]['tn'])

    def high_in_bottom_band(x, a, b):   # <a> top_zone inside <b> bottom band  [bottom_zone .. bottom_near]
        return (x.z[a]['tz'] >= x.z[b]['bz']) & (x.z[a]['tz'] <= x.z[b]['bn'])

    def overlap_break_up(a, b, weekly_cross=False):
        def f(x):
            lvl = x.z[a]['tz']
            hit = x.cross_up(lvl, 'w') if weekly_cross else (x.c >= lvl)
            return high_in_bottom_band(x, a, b) & hit
        return f

    def overlap_break_dn(a, b, weekly_cross=False):
        def f(x):
            lvl = x.z[a]['bz']
            hit = x.cross_dn(lvl, 'w') if weekly_cross else (x.c <= lvl)
            return low_in_top_band(x, a, b) & hit
        return f

    R['Daily_Close_Above_w_z_high_Overlap_w_m_z_low'] = overlap_break_up('w', 'm')
    R['Daily_Close_Below_w_z_low_Overlap_w_m_z_High'] = overlap_break_dn('w', 'm')
    R['Daily_Close_Above_m_z_high_Overlap_m_y_z_low'] = overlap_break_up('m', 'y')
    R['Daily_Close_Below_m_z_low_Overlap_m_y_z_High'] = overlap_break_dn('m', 'y')
    R['weekly_Close_Above_w_z_High_Overlap_wzh_mzl'] = overlap_break_up('w', 'm', True)
    R['weekly_Close_Below_w_z_Low_Overlap_wzl_mzh'] = overlap_break_dn('w', 'm', True)
    R['weekly_Close_Above_m_z_High_Overlap_mzh_qzl'] = overlap_break_up('m', 'q', True)
    R['weekly_Close_Below_m_z_Low_Overlap_mzl_qzh'] = overlap_break_dn('m', 'q', True)
    R['weekly_close_Above_d_z_high_Overlap_dzh_wzl'] = overlap_break_up('d', 'w', True)
    R['weekly_close_below_d_z_low_Overlap_dzl_wzh'] = overlap_break_dn('d', 'w', True)
    R['weekly_Close_Above_m_z_High_Overlap_mzh_yzl'] = overlap_break_up('m', 'y', True)
    R['weekly_Close_Below_m_z_Low_Overlap_mzl_yzh'] = overlap_break_dn('m', 'y', True)

    # === RETRACEMENT ZONES — exactly as your Chartink scan ===
    # DAILY_CLOSE_NEAR_MZ_LOW_OVERLAP_MLZ_QHZ (screenshot):
    #     Monthly bottom_zone <= Quarterly top_zone
    #     Monthly bottom_zone >= Quarterly top_near      -> M zone LOW inside the Q top band
    #     Daily Close >= Monthly bottom_zone
    #     Daily Close <= Monthly bottom_near              -> close inside the M bottom band
    # "near high" versions are the mirror (<a> top_zone inside <b> bottom band, close in <a> top band)
    def retrace_near_low(a, b):
        return lambda x: low_in_top_band(x, a, b) & x.in_band(x.bottom(a))

    def retrace_near_high(a, b):
        return lambda x: high_in_bottom_band(x, a, b) & x.in_band(x.top(a))

    R['Daily_Close_Near_wz_low_Overlap_wlz_mhz'] = retrace_near_low('w', 'm')
    R['Daily_Close_Near_wz_high_Overlap_whz_mlz'] = retrace_near_high('w', 'm')
    R['Daily_Close_Near_dz_low_Overlap_dlz_mhz'] = retrace_near_low('d', 'm')
    R['Daily_Close_Near_dz_high_Overlap_dhz_mlz'] = retrace_near_high('d', 'm')
    R['Daily_Close_Near_mz_low_Overlap_mlz_qhz'] = retrace_near_low('m', 'q')
    R['Daily_Close_Near_mz_low_Overlap_mlz_yhz'] = retrace_near_low('m', 'y')
    R['Daily_Close_Near_mz_high_Overlap_mhz_ylz'] = retrace_near_high('m', 'y')

    return R


def _trend(x, tf, n, up=True):
    """N completed bars each closing higher (up) / lower (down) than the bar before."""
    ok = np.ones(x.n, dtype=bool)
    for i in range(1, n + 1):
        a, b = x.ohlc(tf, 'close', i), x.ohlc(tf, 'close', i + 1)
        ok &= (a > b) if up else (a < b)
    return ok


_TREND_RE = re.compile(r'^last_(\d+)(mon|wk|day)_(up|down)_trend_with_close_(nearto_low_zone|nearto_high_zone|low_zone_breakdown|high_zone_broakup)$')
_VIRGIN_RE = re.compile(r'^last_(\d+)_(week|month|quarter|year)_virgin_(breakout_top_zone|breakdown_bottom_zone)$')
_UNIT_TF = {'mon': 'm', 'wk': 'w', 'day': 'd', 'week': 'w', 'month': 'm', 'quarter': 'q', 'year': 'y'}


def _pattern_rule(name):
    """Rules for the TRENDING / FLAG / VIRGIN families, read from the signal name itself."""
    m = _TREND_RE.match(name)
    if m:
        n, unit, direction, what = int(m.group(1)), m.group(2), m.group(3), m.group(4)
        tf, up = _UNIT_TF[unit], direction == 'up'

        def f(x):
            tr = _trend(x, tf, n, up)
            if what == 'nearto_low_zone':
                return tr & x.in_band(x.bottom(tf))
            if what == 'nearto_high_zone':
                return tr & x.in_band(x.top(tf))
            if what == 'low_zone_breakdown':            # flag: up-trend breaks its low zone
                return tr & x.cross_dn(x.z[tf]['bz'], tf)
            return tr & x.cross_up(x.z[tf]['tz'], tf)   # flag: down-trend breaks its high zone
        return f

    m = _VIRGIN_RE.match(name)
    if m:
        n, unit, what = int(m.group(1)), m.group(2), m.group(3)
        tf = _UNIT_TF[unit]

        def f(x):
            # the last N completed bars each stayed inside THEIR OWN zone (wicks included)
            contained = np.ones(x.n, dtype=bool)
            for i in range(1, n + 1):
                contained &= (x.ohlc(tf, 'high', i) <= x.vzone(tf, 'top', i))
                contained &= (x.ohlc(tf, 'low', i) >= x.vzone(tf, 'bottom', i))
            ok = contained
            if what == 'breakdown_bottom_zone':
                return ok & (x.c <= x.vzone(tf, 'bottom', 0))
            return ok & (x.c >= x.vzone(tf, 'top', 0))
        return f
    return None


_NR_RE = re.compile(r'^([DWMQY])_NR?_(\d+)[DWMQY]_(BO|HN|LW|BD|B2NR)$')


def _nr_masks(x, signal_names):
    """
    NR (mother candle) patterns, exactly as in your Chartink scan:
      mother = bar N  |  bars 1..N-1: open & close inside mother high..low (wicks may poke out)
      BO   : latest close >= mother high
      BD   : latest close <= mother low
      HN   : latest close inside the mother range and >= mother high * NR_NEAR_RATIO
      LW   : latest close inside the mother range and <= mother low / NR_NEAR_RATIO
      B2NR : bars 2..N-1 inside, bar 1 CLOSED below mother low, latest close back inside
    """
    cache, out = {}, {}
    for name in signal_names:
        m = _NR_RE.match(name)
        if not m:
            print(f"  ⚠ NR signal name not understood, skipped: {name}")
            continue
        tf, n, kind = m.group(1).lower(), int(m.group(2)), m.group(3)
        if n > 12:
            continue
        if tf not in cache:
            cache[tf] = {f: x.ohlc_matrix(tf, f) for f in ('open', 'high', 'low', 'close')}
        O, H, L, C = cache[tf]['open'], cache[tf]['high'], cache[tf]['low'], cache[tf]['close']

        mh, ml, mo, mc = H[:, n], L[:, n], O[:, n], C[:, n]
        rng = mh - ml
        mother_ok = np.abs(mo - mc) >= rng * (NR_MOTHER_BODY_PCT / 100)

        def bodies_inside(a, b):
            ok = np.ones(x.n, dtype=bool)
            for i in range(a, b + 1):
                ok &= (O[:, i] <= mh) & (O[:, i] >= ml) & (C[:, i] <= mh) & (C[:, i] >= ml)
            return ok

        c0 = C[:, 0]
        c0 = np.where(np.isnan(c0), x.c, c0)
        inside_now = (c0 >= ml) & (c0 <= mh)

        if kind == 'B2NR':
            mask = mother_ok & bodies_inside(2, n - 1) & (C[:, 1] < ml) & inside_now
        else:
            base = mother_ok & bodies_inside(1, n - 1)
            if kind == 'BO':
                mask = base & (c0 >= mh)
            elif kind == 'BD':
                mask = base & (c0 <= ml)
            elif kind == 'HN':
                mask = base & inside_now & (c0 >= mh * NR_NEAR_RATIO)
            else:  # LW
                mask = base & inside_now & (c0 <= ml / NR_NEAR_RATIO)
        out[name] = mask
    return out


def compute_all_signals(frame, category_stocks=None):
    """
    Returns (stock_zone_signal_map, stock_nr_signal_map) in the SAME shape the old scraper built:
        {'RELIANCE': ['Daily_Close_Above_Monthly_Zone', ...], ...}
    Signal order per stock follows zone_urls / nr_urls, like the old sequential scrape.
    """
    x = _Ctx(frame, category_stocks)
    symbols = frame['symbol'].tolist()
    excluded = np.array([any(w in s.lower() for w in exclude_words) for s in symbols], dtype=bool)

    zone_rules = _zone_rules()
    zone_masks, no_rule = {}, []
    for name in zone_urls:
        rule = zone_rules.get(name) or _pattern_rule(name)
        if rule is None:
            no_rule.append(name)
            continue
        mask = np.asarray(rule(x), dtype=bool)
        zone_masks[name] = mask & ~excluded
    if no_rule:
        print(f"  ⚠ No rule for {len(no_rule)} zone signals: {no_rule}")

    nr_masks = {k: v & ~excluded for k, v in _nr_masks(x, list(nr_urls.keys())).items()}

    def to_map(masks, order):
        mp = {}
        for name in order:
            if name not in masks:
                continue
            for idx in np.flatnonzero(masks[name]):
                mp.setdefault(symbols[idx], []).append(name)
        return mp

    zone_map = to_map(zone_masks, list(zone_urls.keys()))
    nr_map = to_map(nr_masks, list(nr_urls.keys()))

    z_hits = sum(len(v) for v in zone_map.values())
    n_hits = sum(len(v) for v in nr_map.values())
    print(f"  ✓ Zone: {len(zone_masks)} signals calculated, {z_hits} hits across {len(zone_map)} stocks")
    print(f"  ✓ NR:   {len(nr_masks)} signals calculated, {n_hits} hits across {len(nr_map)} stocks")
    return zone_map, nr_map


def master_from_raw(frame, category_stocks):
    """Fallback Master_Stock_Data built from raw-data-5 (same columns as the master scrape)."""
    large = category_stocks.get('Nifty_LargeCap_100', set())
    mid = category_stocks.get('Midcap_150', set())

    def clean_label(val):
        v = ('' if val is None or (isinstance(val, float) and np.isnan(val)) else str(val)).strip()
        if not v or v.lower() in ('n/a', 'na', '-', 'none', 'nan'):
            return 'Unknown'
        return v.title()

    records, master = [], {}
    for i, r in enumerate(frame.itertuples(index=False), 1):
        d = r._asdict()
        sym = d['symbol']
        rec = {
            'Sr': i,
            'Stock_Name': str(d.get('stock_name') or '').strip(),
            'Symbol': sym,
            'Price': float(d['close']) if pd.notna(d.get('close')) else 0.0,
            'Change_Pct': float(d['pct_change']) if pd.notna(d.get('pct_change')) else 0.0,
            'Volume': int(d['volume']) if pd.notna(d.get('volume')) else 0,
            'Sector': clean_label(d.get('sector')),
            'Industry': clean_label(d.get('industry')),
            'Marketcap': 'Largecap' if sym in large else 'Midcap' if sym in mid else 'Smallcap',
        }
        records.append(rec)
        master[sym] = rec
    return master, records


# ------------------------------------------------------------ validation --
def validate_against_chartink(zone_map, nr_map, only='all', limit=None, name_filter=None):
    """
    Calibration tool: scrape the OLD screeners and compare them with the calculated signals.
    Slow (it is the old ~45 min path), so run it only when tuning the rules.
    Writes validation_report_YYYYMMDD.xlsx.
    """
    urls = {}
    if only in ('all', 'zone'):
        urls.update(zone_urls)
    if only in ('all', 'nr'):
        urls.update(nr_urls)
    if name_filter:
        urls = {k: v for k, v in urls.items() if name_filter.lower() in k.lower()}
    if limit:
        urls = dict(list(urls.items())[:limit])

    print(f"\n🔎 VALIDATION: scraping {len(urls)} original screeners for comparison...")
    _, truth_map = scrape_urls_batch(urls, "VALIDATION")

    def invert(mp):
        inv = defaultdict(set)
        for sym, sigs in mp.items():
            for s in sigs:
                inv[s].add(sym)
        return inv

    truth, calc = invert(truth_map), invert({**{k: v for k, v in zone_map.items()}})
    for k, v in invert(nr_map).items():
        calc[k] |= v

    rows = []
    for sig in urls:
        t, c = truth.get(sig, set()), calc.get(sig, set())
        both = t & c
        union = t | c
        rows.append({
            'Signal_Name': sig,
            'Chartink_Count': len(t),
            'Calculated_Count': len(c),
            'Matched': len(both),
            'Missing_In_Calc': len(t - c),
            'Extra_In_Calc': len(c - t),
            'Match_Pct': round(100.0 * len(both) / len(union), 1) if union else 100.0,
            'Missing_Symbols': ', '.join(sorted(t - c)[:40]),
            'Extra_Symbols': ', '.join(sorted(c - t)[:40]),
        })
    df = pd.DataFrame(rows).sort_values(['Match_Pct', 'Chartink_Count'], ascending=[True, False])
    fname = f"validation_report_{datetime.now().strftime('%Y%m%d')}.xlsx"
    df.to_excel(fname, index=False)
    exact = int((df['Match_Pct'] == 100.0).sum())
    print(f"\n✓ Validation report: {fname}")
    print(f"  {exact}/{len(df)} signals match Chartink exactly; overall match "
          f"{df['Matched'].sum()}/{max(1, (df['Chartink_Count'] + df['Extra_In_Calc']).sum())} symbols")
    print(df.head(15)[['Signal_Name', 'Chartink_Count', 'Calculated_Count', 'Match_Pct']].to_string(index=False))
    return fname


# ------------------------------------------------------- snapshot helpers --
def load_snapshot(snapshot_dir):
    texts = {}
    for key in RAW_DATA_URLS:
        p = os.path.join(snapshot_dir, f"{key}.tsv")
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                texts[key] = f.read()
        else:
            print(f"  ⚠ Snapshot file missing: {p}")
    cats = {}
    p = os.path.join(snapshot_dir, 'categories.json')
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            cats = {k: set(v) for k, v in json.load(f).items()}
    master_records = []
    p = os.path.join(snapshot_dir, 'master_records.json')
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            master_records = json.load(f)
    return texts, cats, master_records


def save_snapshot_extras(snapshot_dir, category_stocks, master_records):
    with open(os.path.join(snapshot_dir, 'categories.json'), 'w', encoding='utf-8') as f:
        json.dump({k: sorted(v) for k, v in category_stocks.items()}, f)
    with open(os.path.join(snapshot_dir, 'master_records.json'), 'w', encoding='utf-8') as f:
        json.dump(master_records, f)



def get_signal_categories():
    """Return updated signal categories with ALL new signals properly categorized"""

    long_signals = [
        # Basic Long Signals
        'Daily_Close_Above_Monthly_Zone', 'Daily_Close_Crossed_Above_Monthly_Zone',
        'Weekly_Close_Crossed_Above_Monthly_Zone', 'Near_Monthly_Zone_Top',
        'Close_Above_Weekly_Zone_Below_Monthly_Zone',
        'Daily_Close_Crossed_Above_Weekly_Zone_Below_Monthly_Zone',
        'Weekly_Close_Crossed_Above_Weekly_Zone_Below_Monthly_Zone',
        'Daily_Close_Above_Quarterly_Zone',
        'Quarterly_Close_Above_Monthly_Zone_Below_Quarterly_Zone',
        'Quarterly_Close_Crossed_Above_Monthly_Zone_Below_Quarterly_Zone',
        'Weekly_Close_Crossed_Above_Monthly_Zone_Below_Quarterly_Zone',

        # Daily Zone Long
        'Daily_Close_Above_Daily_Zone_High',
        'Daily_Close_Above_Weekly_Zone_High_Below_Monthly_Zone_High',
        'Daily_Close_Above_Weekly_Zone_High',
        'Daily_Close_Near_Daily_Zone_High',

        # Overlapping Zones Long
        'Daily_Close_Above_w_z_high_Overlap_w_m_z_low',
        'Daily_Close_Above_m_z_high_Overlap_m_y_z_low',
        'weekly_Close_Above_w_z_High_Overlap_wzh_mzl',
        'weekly_Close_Above_m_z_High_Overlap_mzh_qzl',
        'weekly_close_Above_d_z_high_Overlap_dzh_wzl',
        'weekly_Close_Above_m_z_High_Overlap_mzh_yzl',

        # Flag Pattern Long (Reversal)
        'last_4mon_down_trend_with_close_high_zone_broakup',
        'last_3mon_down_trend_with_close_high_zone_broakup',
        'last_4wk_down_trend_with_close_high_zone_broakup',
        'last_3wk_down_trend_with_close_high_zone_broakup',
        'last_4day_down_trend_with_close_high_zone_broakup',
        'last_3day_down_trend_with_close_high_zone_broakup',

        # Virgin Breakout Long
        'last_4_month_virgin_breakout_top_zone', 'last_3_month_virgin_breakout_top_zone',
        'last_2_month_virgin_breakout_top_zone', 'last_4_week_virgin_breakout_top_zone',
        'last_3_week_virgin_breakout_top_zone', 'last_2_week_virgin_breakout_top_zone',
        'last_4_quarter_virgin_breakout_top_zone', 'last_3_quarter_virgin_breakout_top_zone',
        'last_2_quarter_virgin_breakout_top_zone', 'last_4_year_virgin_breakout_top_zone',
        'last_3_year_virgin_breakout_top_zone', 'last_2_year_virgin_breakout_top_zone',
    ]

    short_signals = [
        # Basic Short Signals
        'Daily_Close_Below_Monthly_Zone_Low', 'Daily_Close_Crossed_Below_Monthly_Zone_Low',
        'Weekly_Close_Crossed_Below_Monthly_Zone_Low', 'Near_Monthly_Zone_Low',
        'Daily_Close_Below_Weekly_Zone_Above_Monthly_Zone_Low',
        'Daily_Close_Crossed_Below_Weekly_Zone_Above_Monthly_Zone_Low',
        'Weekly_Close_Crossed_Below_Weekly_Zone_Above_Monthly_Zone_Low',
        'Daily_Close_Below_Quarterly_Zone_Low',
        'Daily_Close_Below_Monthly_Zone_Above_Quarterly_Zone',
        'Daily_Close_Crossed_Below_Monthly_Zone_Above_Quarterly_Zone',
        'Weekly_Close_Crossed_Below_Monthly_Zone_Above_Quarterly_Zone',

        # Daily Zone Short
        'Daily_Close_Below_Daily_Zone_Low',
        'Daily_Close_Below_Weekly_Zone_Low_Above_Monthly_Zone_Low',
        'Daily_Close_Below_Weekly_Zone_Low',
        'Daily_Close_Near_Daily_Zone_Low',

        # Overlapping Zones Short
        'Daily_Close_Below_w_z_low_Overlap_w_m_z_High',
        'Daily_Close_Below_m_z_low_Overlap_m_y_z_High',
        'weekly_Close_Below_w_z_Low_Overlap_wzl_mzh',
        'weekly_Close_Below_m_z_Low_Overlap_mzl_qzh',
        'weekly_close_below_d_z_low_Overlap_dzl_wzh',
        'weekly_Close_Below_m_z_Low_Overlap_mzl_yzh',

        # Flag Pattern Short (Reversal)
        'last_4mon_up_trend_with_close_low_zone_breakdown',
        'last_3mon_up_trend_with_close_low_zone_breakdown',
        'last_4wk_up_trend_with_close_low_zone_breakdown',
        'last_3wk_up_trend_with_close_low_zone_breakdown',
        'last_4day_up_trend_with_close_low_zone_breakdown',
        'last_3day_up_trend_with_close_low_zone_breakdown',

        # Virgin Breakdown Short
        'last_4_month_virgin_breakdown_bottom_zone', 'last_3_month_virgin_breakdown_bottom_zone',
        'last_2_month_virgin_breakdown_bottom_zone', 'last_4_week_virgin_breakdown_bottom_zone',
        'last_3_week_virgin_breakdown_bottom_zone', 'last_2_week_virgin_breakdown_bottom_zone',
        'last_4_quarter_virgin_breakdown_bottom_zone', 'last_3_quarter_virgin_breakdown_bottom_zone',
        'last_2_quarter_virgin_breakdown_bottom_zone', 'last_4_year_virgin_breakdown_bottom_zone',
        'last_3_year_virgin_breakdown_bottom_zone', 'last_2_year_virgin_breakdown_bottom_zone',
    ]

    retracement_signals = [
        # Overlapping Zone Retracements
        'Daily_Close_Near_and_abv_Overlap_Weekly_Monthly_Zone_Low',
        'Daily_Close_Near_and_blw_Overlap_Weekly_Monthly_Zone_High',
        'Daily_Close_Near_and_abv_Overlap_monthly_quaterly_Zone_Low',
        'Daily_Close_Near_and_blw_Overlap_Monthly_quaterly_Zone_High',
        'Daily_Close_Near_and_abv_Overlap_monthly_yearly_Zone_Low',
        'Daily_Close_Near_and_blw_Overlap_Monthly_yearly_Zone_High',

        # Retracement Zones
        'Daily_Close_Near_wz_low_Overlap_wlz_mhz',
        'Daily_Close_Near_wz_high_Overlap_whz_mlz',
        'Daily_Close_Near_dz_low_Overlap_dlz_mhz',
        'Daily_Close_Near_dz_high_Overlap_dhz_mlz',
        'Daily_Close_Near_mz_low_Overlap_mlz_qhz',
        'Daily_Close_Near_mz_high_Overlap_mhz_qlz',
        'Daily_Close_Near_mz_low_Overlap_mlz_yhz',
        'Daily_Close_Near_mz_high_Overlap_mhz_ylz',

        # Trending Zones (Retracement in trend)
        'last_4mon_up_trend_with_close_nearto_low_zone',
        'last_4mon_down_trend_with_close_nearto_high_zone',
        'last_3mon_up_trend_with_close_nearto_low_zone',
        'last_3mon_down_trend_with_close_nearto_high_zone',
        'last_4wk_up_trend_with_close_nearto_low_zone',
        'last_4wk_down_trend_with_close_nearto_high_zone',
        'last_3wk_up_trend_with_close_nearto_low_zone',
        'last_3wk_down_trend_with_close_nearto_high_zone',
        'last_4day_up_trend_with_close_nearto_low_zone',
        'last_4day_down_trend_with_close_nearto_high_zone',
        'last_3day_up_trend_with_close_nearto_low_zone',
        'last_3day_down_trend_with_close_nearto_high_zone',
    ]

    mixed_signals = [
        'Near_Monthly_Zone_Top',
        'Near_Monthly_Zone_Low',
        'Daily_Close_Near_Daily_Zone_High',
        'Daily_Close_Near_Daily_Zone_Low',
    ]

    return long_signals, short_signals, retracement_signals, mixed_signals

def generate_enhanced_analysis(stock_zone_signal_map, stock_nr_signal_map, zone_urls, nr_urls, category_stocks):
    """Generate enhanced analysis with additional sheets"""

    long_signals, short_signals, retracement_signals, mixed_signals = get_signal_categories()

    # Combined stock map
    combined_stock_map = {}
    all_stocks = set(list(stock_zone_signal_map.keys()) + list(stock_nr_signal_map.keys()))

    for ticker in all_stocks:
        zone_signals = stock_zone_signal_map.get(ticker, [])
        nr_signals = stock_nr_signal_map.get(ticker, [])
        combined_stock_map[ticker] = {
            'zone_signals': zone_signals,
            'nr_signals': nr_signals
        }

    # Generate detailed analysis
    print("➤ Generating detailed analysis...")
    detailed_output = []

    for ticker, signal_info in combined_stock_map.items():
        zone_signals = signal_info['zone_signals']
        nr_signals = signal_info['nr_signals']

        long_count = sum(1 for signal in zone_signals if signal in long_signals)
        short_count = sum(1 for signal in zone_signals if signal in short_signals)
        retracement_count = sum(1 for signal in zone_signals if signal in retracement_signals)
        mixed_count = sum(1 for signal in zone_signals if signal in mixed_signals)

        if retracement_count > 0:
            bias = "RETRACEMENT"
        elif long_count > 0 and short_count > 0:
            bias = "MIXED"
        elif long_count > short_count:
            bias = "LONG"
        elif short_count > long_count:
            bias = "SHORT"
        else:
            bias = "NEUTRAL"

        detailed_output.append({
            'Symbol': f"NSE:{ticker},",
            'Zone_Signal_Count': len(zone_signals),
            'Zone_Signals': str(zone_signals),
            'Long_Signal_Count': long_count,
            'Short_Signal_Count': short_count,
            'Retracement_Signal_Count': retracement_count,
            'Mixed_Signal_Count': mixed_count,
            'Trading_Bias': bias,
            'NR_Signal_Count': len(nr_signals),
            'NR_Signals': str(nr_signals),
            'Has_Both_Signal_Types': 'Yes' if zone_signals and nr_signals else 'No',
            'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
            'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
            'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
            'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
            'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
            'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No'
        })

    return combined_stock_map, detailed_output


def _attach_strength_scores(rows):
    """
    Attach a 0-100 composite Strength_Score + Strength_Label to each row (sector or industry).

    Strength_Score = 40% Net Bias   (bullish - bearish signal count, min-max normalized across rows)
                    + 30% Breadth   (advancing / (advancing + declining))
                    + 30% Momentum  (avg price %change, min-max normalized across rows)

    Transparent, tunable composite. Adjust the 0.4 / 0.3 / 0.3 weights below if you want
    signal bias or price momentum to dominate more.
    """
    if not rows:
        return

    net_biases = [r['Net_Bias_Score'] for r in rows]
    avg_changes = [r['Avg_Change_Pct'] for r in rows]

    def normalize(val, vals):
        lo, hi = min(vals), max(vals)
        if hi == lo:
            return 50.0
        return (val - lo) / (hi - lo) * 100

    for r in rows:
        bias_norm = normalize(r['Net_Bias_Score'], net_biases)
        change_norm = normalize(r['Avg_Change_Pct'], avg_changes)
        breadth_norm = r['Advance_Decline_Ratio'] * 100

        strength = round(0.4 * bias_norm + 0.3 * breadth_norm + 0.3 * change_norm, 1)
        r['Strength_Score'] = strength

        if strength >= 70:
            label = 'Very Strong'
        elif strength >= 55:
            label = 'Strong'
        elif strength >= 45:
            label = 'Neutral'
        elif strength >= 30:
            label = 'Weak'
        else:
            label = 'Very Weak'
        r['Strength_Label'] = label


def build_sector_industry_analysis(master_stock_data, stock_zone_signal_map, stock_nr_signal_map):
    """
    Deep-dive analysis merging the master Sector/Industry/Marketcap/Price table with the
    Zone + NR signal maps that are already being scraped.

    Returns:
      sector_rows    - list[dict], one row per Sector, sorted by Strength_Score desc
      industry_rows  - list[dict], one row per (Sector, Industry) pair, sorted by Strength_Score desc
      nr_detail_rows - list[dict], long-format NR pattern counts by Sector & Industry & signal name
    """
    long_signals, short_signals, retracement_signals, mixed_signals = get_signal_categories()

    all_symbols = set(master_stock_data.keys()) | set(stock_zone_signal_map.keys()) | set(stock_nr_signal_map.keys())

    def sector_of(sym):
        return master_stock_data.get(sym, {}).get('Sector', 'Unknown')

    def industry_of(sym):
        return master_stock_data.get(sym, {}).get('Industry', 'Unknown')

    def change_of(sym):
        rec = master_stock_data.get(sym)
        return rec.get('Change_Pct') if rec else None

    def volume_of(sym):
        rec = master_stock_data.get(sym)
        return rec.get('Volume', 0) if rec else 0

    def marketcap_of(sym):
        rec = master_stock_data.get(sym)
        return rec.get('Marketcap', 'Unknown') if rec else 'Unknown'

    sector_groups = defaultdict(set)
    industry_pairs = defaultdict(set)

    for sym in all_symbols:
        sec = sector_of(sym)
        ind = industry_of(sym)
        sector_groups[sec].add(sym)
        industry_pairs[(sec, ind)].add(sym)

    def compute_group_metrics(symbols):
        total = len(symbols)
        changes = [change_of(s) for s in symbols if change_of(s) is not None]
        advancing = sum(1 for c in changes if c > 0)
        declining = sum(1 for c in changes if c < 0)
        unchanged = sum(1 for c in changes if c == 0)
        avg_change = (sum(changes) / len(changes)) if changes else 0.0
        total_volume = sum(volume_of(s) for s in symbols)

        marketcap_counts = defaultdict(int)
        for s in symbols:
            marketcap_counts[marketcap_of(s)] += 1
        marketcap_breakdown = ', '.join(
            f"{k}:{v}" for k, v in sorted(marketcap_counts.items(), key=lambda kv: -kv[1])
        )

        zone_long = zone_short = zone_retrace = zone_mixed = 0
        stocks_with_zone = 0
        nr_breakout = nr_breakdown = nr_near_high = nr_near_low = nr_back2nr = 0
        stocks_with_nr = 0

        for s in symbols:
            zsigs = stock_zone_signal_map.get(s, [])
            nsigs = stock_nr_signal_map.get(s, [])

            if zsigs:
                stocks_with_zone += 1
                zone_long += sum(1 for x in zsigs if x in long_signals)
                zone_short += sum(1 for x in zsigs if x in short_signals)
                zone_retrace += sum(1 for x in zsigs if x in retracement_signals)
                zone_mixed += sum(1 for x in zsigs if x in mixed_signals)

            if nsigs:
                stocks_with_nr += 1
                nr_breakout += sum(1 for x in nsigs if '_BO' in x)
                nr_breakdown += sum(1 for x in nsigs if '_BD' in x)
                nr_near_high += sum(1 for x in nsigs if '_HN' in x)
                nr_near_low += sum(1 for x in nsigs if '_LW' in x)
                nr_back2nr += sum(1 for x in nsigs if '_B2NR' in x)

        total_signals = (zone_long + zone_short + zone_retrace + zone_mixed +
                          nr_breakout + nr_breakdown + nr_near_high + nr_near_low + nr_back2nr)
        bullish = zone_long + nr_breakout
        bearish = zone_short + nr_breakdown
        net_bias = bullish - bearish
        adv_decl_total = advancing + declining
        adv_ratio = (advancing / adv_decl_total) if adv_decl_total else 0.5
        signal_density = (total_signals / total) if total else 0.0

        return {
            'Total_Stocks': total,
            'Advancing': advancing,
            'Declining': declining,
            'Unchanged': unchanged,
            'Avg_Change_Pct': round(avg_change, 2),
            'Total_Volume': total_volume,
            'Marketcap_Breakdown': marketcap_breakdown,
            'Stocks_With_Zone_Signal': stocks_with_zone,
            'Zone_Long_Count': zone_long,
            'Zone_Short_Count': zone_short,
            'Zone_Retracement_Count': zone_retrace,
            'Zone_Mixed_Count': zone_mixed,
            'Stocks_With_NR_Signal': stocks_with_nr,
            'NR_Breakout_Count': nr_breakout,
            'NR_Breakdown_Count': nr_breakdown,
            'NR_Near_High_Count': nr_near_high,
            'NR_Near_Low_Count': nr_near_low,
            'NR_Back_To_NR_Count': nr_back2nr,
            'Total_Signal_Count': total_signals,
            'Bullish_Score': bullish,
            'Bearish_Score': bearish,
            'Net_Bias_Score': net_bias,
            'Advance_Decline_Ratio': round(adv_ratio, 3),
            'Signal_Density': round(signal_density, 3),
        }

    # --- Sector level ---
    sector_rows = []
    for sec, symbols in sector_groups.items():
        sector_rows.append({'Sector': sec, **compute_group_metrics(symbols)})
    _attach_strength_scores(sector_rows)
    sector_rows.sort(key=lambda r: r['Strength_Score'], reverse=True)

    # --- Industry level (Sector kept alongside for context / pivoting) ---
    industry_rows = []
    for (sec, ind), symbols in industry_pairs.items():
        industry_rows.append({'Sector': sec, 'Industry': ind, **compute_group_metrics(symbols)})
    _attach_strength_scores(industry_rows)
    industry_rows.sort(key=lambda r: r['Strength_Score'], reverse=True)

    # --- NR pattern detail by Sector & Industry & exact signal name (long format for pivoting) ---
    pattern_map = {'_BO': 'Breakout', '_BD': 'Breakdown', '_HN': 'Near High', '_LW': 'Near Low', '_B2NR': 'Back to NR'}
    detail_counter = defaultdict(int)

    for sym, nsigs in stock_nr_signal_map.items():
        sec = sector_of(sym)
        ind = industry_of(sym)
        for sig in nsigs:
            detail_counter[(sec, ind, sig)] += 1

    nr_detail_rows = []
    for (sec, ind, sig), count in detail_counter.items():
        ptype = next((label for suffix, label in pattern_map.items() if suffix in sig), 'Unknown')
        nr_detail_rows.append({
            'Sector': sec,
            'Industry': ind,
            'NR_Signal': sig,
            'Pattern_Type': ptype,
            'Stock_Count': count,
        })
    nr_detail_rows.sort(key=lambda r: r['Stock_Count'], reverse=True)

    return sector_rows, industry_rows, nr_detail_rows


def _writable_filename(filename):
    """
    If the file is open in Excel (Windows locks it -> PermissionError), save under a
    time-stamped name instead of failing the whole run.
    """
    if not os.path.exists(filename):
        return filename
    try:
        with open(filename, 'a+b'):
            return filename
    except OSError:
        base, ext = os.path.splitext(filename)
        alt = f"{base}_{datetime.now().strftime('%H%M%S')}{ext}"
        print(f"  ⚠ {filename} is open in another program (Excel?) — saving as {alt} instead")
        return alt


def save_excel_with_enhanced_sheets(combined_stock_map, detailed_output, zone_urls, nr_urls,
                                     stock_zone_signal_map, stock_nr_signal_map, category_stocks,
                                     sector_rows=None, industry_rows=None, nr_detail_rows=None,
                                     master_stock_records=None, extra_sheets=None):
    """Save Excel with all enhanced sheets (original 10 sheets untouched, new Sector/Industry sheets appended)"""

    long_signals, short_signals, retracement_signals, mixed_signals = get_signal_categories()

    # Get date for filename
    today_date = datetime.now().strftime("%Y%m%d")
    filename = _writable_filename(f'detailed_signals_{today_date}.xlsx')

    try:
        print(f"➤ Saving {filename} with enhanced analysis...")

        with pd.ExcelWriter(filename, engine='openpyxl') as writer:

            # Sheet 1: Detailed Signals
            df_detailed = pd.DataFrame(detailed_output)
            df_detailed.to_excel(writer, sheet_name='Detailed_Signals', index=False)

            # Sheet 2: Flat Data for Slicers
            flat_data = []
            processed_stocks = set()

            for ticker, signal_info in combined_stock_map.items():
                if ticker in processed_stocks:
                    continue
                processed_stocks.add(ticker)

                zone_signals = signal_info['zone_signals']
                nr_signals = signal_info['nr_signals']

                long_count = sum(1 for signal in zone_signals if signal in long_signals)
                short_count = sum(1 for signal in zone_signals if signal in short_signals)
                retracement_count = sum(1 for signal in zone_signals if signal in retracement_signals)
                mixed_count = sum(1 for signal in zone_signals if signal in mixed_signals)

                if retracement_count > 0:
                    bias = "RETRACEMENT"
                elif long_count > 0 and short_count > 0:
                    bias = "MIXED"
                elif long_count > short_count:
                    bias = "LONG"
                elif short_count > long_count:
                    bias = "SHORT"
                else:
                    bias = "NEUTRAL"

                # Zone signals
                for zone_signal in zone_signals:
                    if zone_signal in long_signals:
                        signal_type = "LONG"
                    elif zone_signal in short_signals:
                        signal_type = "SHORT"
                    elif zone_signal in retracement_signals:
                        signal_type = "RETRACEMENT"
                    elif zone_signal in mixed_signals:
                        signal_type = "MIXED"
                    else:
                        signal_type = "UNKNOWN"

                    flat_data.append({
                        'Symbol': f"NSE:{ticker},",
                        'Signal_Name': zone_signal,
                        'Signal_Category': 'ZONE',
                        'Signal_Type': signal_type,
                        'Trading_Bias': bias,
                        'Total_Zone_Signals': len(zone_signals),
                        'Total_NR_Signals': len(nr_signals),
                        'Has_Both_Types': 'Yes' if zone_signals and nr_signals else 'No',
                        'Long_Signal_Count': long_count,
                        'Short_Signal_Count': short_count,
                        'Retracement_Signal_Count': retracement_count,
                        'Mixed_Signal_Count': mixed_count,
                        'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
                        'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                        'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
                        'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
                        'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
                        'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No',
                    })

                # NR signals
                for nr_signal in nr_signals:
                    if '_W_' in nr_signal or nr_signal.startswith('W_'):
                        timeframe = 'Weekly'
                    elif '_M_' in nr_signal or nr_signal.startswith('M_'):
                        timeframe = 'Monthly'
                    elif '_Q_' in nr_signal or nr_signal.startswith('Q_'):
                        timeframe = 'Quarterly'
                    elif '_Y_' in nr_signal or nr_signal.startswith('Y_'):
                        timeframe = 'Yearly'
                    elif '_D_' in nr_signal or nr_signal.startswith('D_'):
                        timeframe = 'Daily'
                    else:
                        timeframe = 'Unknown'

                    if '_BO' in nr_signal:
                        pattern_type = 'Breakout'
                    elif '_HN' in nr_signal:
                        pattern_type = 'Near High'
                    elif '_LW' in nr_signal:
                        pattern_type = 'Near Low'
                    elif '_BD' in nr_signal:
                        pattern_type = 'Breakdown'
                    elif '_B2NR' in nr_signal:
                        pattern_type = 'Back to NR'
                    else:
                        pattern_type = 'Unknown'

                    flat_data.append({
                        'Symbol': f"NSE:{ticker},",
                        'Signal_Name': nr_signal,
                        'Signal_Category': 'NR_PATTERN',
                        'Signal_Type': pattern_type,
                        'Timeframe': timeframe,
                        'Trading_Bias': bias,
                        'Total_Zone_Signals': len(zone_signals),
                        'Total_NR_Signals': len(nr_signals),
                        'Has_Both_Types': 'Yes' if zone_signals and nr_signals else 'No',
                        'Long_Signal_Count': long_count,
                        'Short_Signal_Count': short_count,
                        'Retracement_Signal_Count': retracement_count,
                        'Mixed_Signal_Count': mixed_count,
                        'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
                        'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                        'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
                        'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
                        'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
                        'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No',
                    })

                if not zone_signals and not nr_signals:
                    flat_data.append({
                        'Symbol': f"NSE:{ticker},",
                        'Signal_Name': 'No Signals',
                        'Signal_Category': 'NONE',
                        'Signal_Type': 'NONE',
                        'Trading_Bias': 'NEUTRAL',
                        'Total_Zone_Signals': 0,
                        'Total_NR_Signals': 0,
                        'Has_Both_Types': 'No',
                        'Long_Signal_Count': 0,
                        'Short_Signal_Count': 0,
                        'Retracement_Signal_Count': 0,
                        'Mixed_Signal_Count': 0,
                        'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
                        'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                        'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
                        'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
                        'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
                        'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No',
                    })

            df_flat = pd.DataFrame(flat_data)
            df_flat.to_excel(writer, sheet_name='Flat_Data_For_Slicers', index=False)

            # Sheet 3: Signal Matrix
            signal_matrix_data = []
            all_zone_signals = list(zone_urls.keys())
            all_nr_signals = list(nr_urls.keys())

            for ticker, signal_info in combined_stock_map.items():
                zone_signals = signal_info['zone_signals']
                nr_signals = signal_info['nr_signals']

                long_count = sum(1 for signal in zone_signals if signal in long_signals)
                short_count = sum(1 for signal in zone_signals if signal in short_signals)
                retracement_count = sum(1 for signal in zone_signals if signal in retracement_signals)
                mixed_count = sum(1 for signal in zone_signals if signal in mixed_signals)

                if retracement_count > 0:
                    bias = "RETRACEMENT"
                elif long_count > 0 and short_count > 0:
                    bias = "MIXED"
                elif long_count > short_count:
                    bias = "LONG"
                elif short_count > long_count:
                    bias = "SHORT"
                else:
                    bias = "NEUTRAL"

                row_data = {
                    'Symbol': f"NSE:{ticker},",
                    'Trading_Bias': bias,
                    'Total_Zone_Signals': len(zone_signals),
                    'Total_NR_Signals': len(nr_signals),
                    'Long_Signal_Count': long_count,
                    'Short_Signal_Count': short_count,
                    'Retracement_Signal_Count': retracement_count,
                    'Mixed_Signal_Count': mixed_count,
                    'Has_Both_Types': 'Yes' if zone_signals and nr_signals else 'No',
                    'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
                    'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                    'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
                    'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
                    'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
                    'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No',
                }

                for signal in all_zone_signals:
                    row_data[f"ZONE_{signal}"] = 'Yes' if signal in zone_signals else 'No'

                for signal in all_nr_signals:
                    row_data[f"NR_{signal}"] = 'Yes' if signal in nr_signals else 'No'

                signal_matrix_data.append(row_data)

            df_matrix = pd.DataFrame(signal_matrix_data)
            df_matrix.to_excel(writer, sheet_name='Signal_Matrix', index=False)

            # Sheet 4: Signal Summary
            summary_data = []

            for signal in all_zone_signals:
                count = sum(1 for ticker, info in combined_stock_map.items() if signal in info['zone_signals'])

                if signal in long_signals:
                    signal_type = "LONG"
                elif signal in short_signals:
                    signal_type = "SHORT"
                elif signal in retracement_signals:
                    signal_type = "RETRACEMENT"
                elif signal in mixed_signals:
                    signal_type = "MIXED"
                else:
                    signal_type = "UNKNOWN"

                summary_data.append({
                    'Signal_Name': signal,
                    'Signal_Category': 'ZONE',
                    'Signal_Type': signal_type,
                    'Stock_Count': count,
                    'URL': zone_urls.get(signal, '')
                })

            for signal in all_nr_signals:
                count = sum(1 for ticker, info in combined_stock_map.items() if signal in info['nr_signals'])

                if '_W_' in signal or signal.startswith('W_'):
                    timeframe = 'Weekly'
                elif '_M_' in signal or signal.startswith('M_'):
                    timeframe = 'Monthly'
                elif '_Q_' in signal or signal.startswith('Q_'):
                    timeframe = 'Quarterly'
                elif '_Y_' in signal or signal.startswith('Y_'):
                    timeframe = 'Yearly'
                elif '_D_' in signal or signal.startswith('D_'):
                    timeframe = 'Daily'
                else:
                    timeframe = 'Unknown'

                if '_BO' in signal:
                    pattern_type = 'Breakout'
                elif '_HN' in signal:
                    pattern_type = 'Near High'
                elif '_LW' in signal:
                    pattern_type = 'Near Low'
                elif '_BD' in signal:
                    pattern_type = 'Breakdown'
                elif '_B2NR' in signal:
                    pattern_type = 'Back to NR'
                else:
                    pattern_type = 'Unknown'

                summary_data.append({
                    'Signal_Name': signal,
                    'Signal_Category': 'NR_PATTERN',
                    'Signal_Type': pattern_type,
                    'Timeframe': timeframe,
                    'Stock_Count': count,
                    'URL': nr_urls.get(signal, '')
                })

            summary_data.sort(key=lambda x: x['Stock_Count'], reverse=True)
            df_summary = pd.DataFrame(summary_data)
            df_summary.to_excel(writer, sheet_name='Signal_Summary', index=False)

            # Sheet 5: Top Opportunities
            print("  ➤ Generating Top Opportunities sheet...")
            top_opportunities = []

            for ticker, signal_info in combined_stock_map.items():
                zone_signals = signal_info['zone_signals']
                nr_signals = signal_info['nr_signals']

                if zone_signals and nr_signals:
                    long_count = sum(1 for signal in zone_signals if signal in long_signals)
                    short_count = sum(1 for signal in zone_signals if signal in short_signals)
                    retracement_count = sum(1 for signal in zone_signals if signal in retracement_signals)

                    if retracement_count > 0:
                        bias = "RETRACEMENT"
                    elif long_count > 0 and short_count > 0:
                        bias = "MIXED"
                    elif long_count > short_count:
                        bias = "LONG"
                    elif short_count > long_count:
                        bias = "SHORT"
                    else:
                        bias = "NEUTRAL"

                    total_signals = len(zone_signals) + len(nr_signals)

                    top_opportunities.append({
                        'Symbol': f"NSE:{ticker},",
                        'Trading_Bias': bias,
                        'Total_Signals': total_signals,
                        'Zone_Signals': len(zone_signals),
                        'NR_Signals': len(nr_signals),
                        'Long_Signals': long_count,
                        'Short_Signals': short_count,
                        'Retracement_Signals': retracement_count,
                        'Zone_Signal_List': ', '.join(zone_signals),
                        'NR_Signal_List': ', '.join(nr_signals),
                        'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
                        'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                        'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
                        'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
                        'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
                        'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No'
                    })

            top_opportunities.sort(key=lambda x: x['Total_Signals'], reverse=True)
            df_top = pd.DataFrame(top_opportunities)
            df_top.to_excel(writer, sheet_name='Top_Opportunities', index=False)

            # Sheet 6: Bias Distribution
            print("  ➤ Generating Bias Distribution sheet...")
            bias_distribution = {
                'LONG': 0, 'SHORT': 0, 'RETRACEMENT': 0, 'MIXED': 0, 'NEUTRAL': 0
            }

            for row in detailed_output:
                bias = row['Trading_Bias']
                bias_distribution[bias] += 1

            bias_data = [
                {'Trading_Bias': bias, 'Stock_Count': count,
                 'Percentage': f"{(count/len(detailed_output)*100):.1f}%" if len(detailed_output) > 0 else "0.0%"}
                for bias, count in bias_distribution.items()
            ]

            df_bias = pd.DataFrame(bias_data)
            df_bias.to_excel(writer, sheet_name='Bias_Distribution', index=False)

            # Sheet 7: Signal Type Analysis
            print("  ➤ Generating Signal Type Analysis sheet...")
            signal_type_data = []

            for signal_type in ['LONG', 'SHORT', 'RETRACEMENT', 'MIXED']:
                if signal_type == 'LONG':
                    signals_list = long_signals
                elif signal_type == 'SHORT':
                    signals_list = short_signals
                elif signal_type == 'RETRACEMENT':
                    signals_list = retracement_signals
                else:
                    signals_list = mixed_signals

                stocks_with_type = set()
                total_occurrences = 0

                for ticker, signal_info in combined_stock_map.items():
                    zone_signals = signal_info['zone_signals']
                    matching = [s for s in zone_signals if s in signals_list]
                    if matching:
                        stocks_with_type.add(ticker)
                        total_occurrences += len(matching)

                signal_type_data.append({
                    'Signal_Type': signal_type,
                    'Category': 'ZONE',
                    'Unique_Stocks': len(stocks_with_type),
                    'Total_Signal_Occurrences': total_occurrences,
                    'Avg_Signals_Per_Stock': f"{total_occurrences/len(stocks_with_type):.2f}" if stocks_with_type else '0.00'
                })

            for pattern_type in ['Breakout', 'Near High', 'Near Low', 'Breakdown', 'Back to NR']:
                stocks_with_pattern = set()
                total_occurrences = 0

                for ticker, signal_info in combined_stock_map.items():
                    nr_signals = signal_info['nr_signals']

                    if pattern_type == 'Breakout':
                        matching = [s for s in nr_signals if '_BO' in s]
                    elif pattern_type == 'Near High':
                        matching = [s for s in nr_signals if '_HN' in s]
                    elif pattern_type == 'Near Low':
                        matching = [s for s in nr_signals if '_LW' in s]
                    elif pattern_type == 'Breakdown':
                        matching = [s for s in nr_signals if '_BD' in s]
                    else:  # Back to NR
                        matching = [s for s in nr_signals if '_B2NR' in s]

                    if matching:
                        stocks_with_pattern.add(ticker)
                        total_occurrences += len(matching)

                signal_type_data.append({
                    'Signal_Type': pattern_type,
                    'Category': 'NR_PATTERN',
                    'Unique_Stocks': len(stocks_with_pattern),
                    'Total_Signal_Occurrences': total_occurrences,
                    'Avg_Signals_Per_Stock': f"{total_occurrences/len(stocks_with_pattern):.2f}" if stocks_with_pattern else '0.00'
                })

            df_signal_type = pd.DataFrame(signal_type_data)
            df_signal_type.to_excel(writer, sheet_name='Signal_Type_Analysis', index=False)

            # Sheet 8: Multi-Timeframe NR Stocks
            print("  ➤ Generating Multi-Timeframe NR Stocks sheet...")
            multi_timeframe_stocks = []

            for stock, nr_signals in stock_nr_signal_map.items():
                if len(nr_signals) > 1:
                    timeframes = set()
                    for signal in nr_signals:
                        if '_W_' in signal or signal.startswith('W_'):
                            timeframes.add('Weekly')
                        elif '_M_' in signal or signal.startswith('M_'):
                            timeframes.add('Monthly')
                        elif '_Q_' in signal or signal.startswith('Q_'):
                            timeframes.add('Quarterly')
                        elif '_Y_' in signal or signal.startswith('Y_'):
                            timeframes.add('Yearly')
                        elif '_D_' in signal or signal.startswith('D_'):
                            timeframes.add('Daily')

                    multi_timeframe_stocks.append({
                        'Symbol': f"NSE:{stock},",
                        'NR_Signal_Count': len(nr_signals),
                        'Timeframes': ', '.join(sorted(timeframes)),
                        'Timeframe_Count': len(timeframes),
                        'NR_Signals': ', '.join(nr_signals),
                        'Is_FNO': 'Yes' if stock in category_stocks.get('FNO', set()) else 'No',
                        'Is_Nifty_LargeCap_100': 'Yes' if stock in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                        'Is_Midcap_150': 'Yes' if stock in category_stocks.get('Midcap_150', set()) else 'No',
                        'Is_SmallCap_250': 'Yes' if stock in category_stocks.get('SmallCap_250', set()) else 'No',
                        'Is_MicroCap_250': 'Yes' if stock in category_stocks.get('MicroCap_250', set()) else 'No',
                        'Is_Nifty_500': 'Yes' if stock in category_stocks.get('Nifty_500', set()) else 'No',
                    })

            multi_timeframe_stocks.sort(key=lambda x: (x['Timeframe_Count'], x['NR_Signal_Count']), reverse=True)
            df_multi = pd.DataFrame(multi_timeframe_stocks)
            df_multi.to_excel(writer, sheet_name='Multi_Timeframe_NR', index=False)

            # Sheet 9: Strong Conviction Stocks
            print("  ➤ Generating Strong Conviction sheet...")
            strong_conviction = []

            for ticker, signal_info in combined_stock_map.items():
                zone_signals = signal_info['zone_signals']

                long_count = sum(1 for signal in zone_signals if signal in long_signals)
                short_count = sum(1 for signal in zone_signals if signal in short_signals)
                retracement_count = sum(1 for signal in zone_signals if signal in retracement_signals)

                if long_count >= 3 and short_count == 0:
                    conviction_type = "STRONG LONG"
                    conviction_score = long_count
                elif short_count >= 3 and long_count == 0:
                    conviction_type = "STRONG SHORT"
                    conviction_score = short_count
                elif retracement_count >= 2:
                    conviction_type = "RETRACEMENT PLAY"
                    conviction_score = retracement_count
                else:
                    continue

                strong_conviction.append({
                    'Symbol': f"NSE:{ticker},",
                    'Conviction_Type': conviction_type,
                    'Conviction_Score': conviction_score,
                    'Long_Signals': long_count,
                    'Short_Signals': short_count,
                    'Retracement_Signals': retracement_count,
                    'Has_NR_Signal': 'Yes' if signal_info['nr_signals'] else 'No',
                    'NR_Signal_Count': len(signal_info['nr_signals']),
                    'Zone_Signal_List': ', '.join(zone_signals),
                    'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
                    'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                    'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
                    'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
                    'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
                    'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No',
                })

            strong_conviction.sort(key=lambda x: x['Conviction_Score'], reverse=True)
            df_conviction = pd.DataFrame(strong_conviction)
            df_conviction.to_excel(writer, sheet_name='Strong_Conviction', index=False)

            # Sheet 10: Virgin Breakout/Breakdown Analysis
            print("  ➤ Generating Virgin BO/BD Analysis sheet...")
            virgin_analysis = []

            for ticker, signal_info in combined_stock_map.items():
                zone_signals = signal_info['zone_signals']

                virgin_bo = [s for s in zone_signals if 'virgin_breakout' in s.lower()]
                virgin_bd = [s for s in zone_signals if 'virgin_breakdown' in s.lower()]

                if virgin_bo or virgin_bd:
                    timeframe_analysis = []

                    for signal in virgin_bo + virgin_bd:
                        if 'month' in signal.lower():
                            tf = 'Monthly'
                        elif 'week' in signal.lower():
                            tf = 'Weekly'
                        elif 'quarter' in signal.lower():
                            tf = 'Quarterly'
                        elif 'year' in signal.lower():
                            tf = 'Yearly'
                        else:
                            tf = 'Unknown'

                        parts = signal.split('_')
                        duration = parts[1] if len(parts) > 1 else 'Unknown'

                        timeframe_analysis.append(f"{duration}_{tf}")

                    virgin_analysis.append({
                        'Symbol': f"NSE:{ticker},",
                        'Virgin_Type': 'Breakout' if virgin_bo else 'Breakdown',
                        'Virgin_Signal_Count': len(virgin_bo) + len(virgin_bd),
                        'Timeframes': ', '.join(timeframe_analysis),
                        'Has_NR_Signal': 'Yes' if signal_info['nr_signals'] else 'No',
                        'NR_Count': len(signal_info['nr_signals']),
                        'Virgin_Signals': ', '.join(virgin_bo + virgin_bd),
                        'Is_FNO': 'Yes' if ticker in category_stocks.get('FNO', set()) else 'No',
                        'Is_Nifty_LargeCap_100': 'Yes' if ticker in category_stocks.get('Nifty_LargeCap_100', set()) else 'No',
                        'Is_Midcap_150': 'Yes' if ticker in category_stocks.get('Midcap_150', set()) else 'No',
                        'Is_SmallCap_250': 'Yes' if ticker in category_stocks.get('SmallCap_250', set()) else 'No',
                        'Is_MicroCap_250': 'Yes' if ticker in category_stocks.get('MicroCap_250', set()) else 'No',
                        'Is_Nifty_500': 'Yes' if ticker in category_stocks.get('Nifty_500', set()) else 'No',
                    })

            virgin_analysis.sort(key=lambda x: x['Virgin_Signal_Count'], reverse=True)
            df_virgin = pd.DataFrame(virgin_analysis)
            df_virgin.to_excel(writer, sheet_name='Virgin_BO_BD_Analysis', index=False)

            # ================================================================
            # NEW SHEETS BELOW - none of the sheets above were modified/removed
            # ================================================================

            # NEW Sheet 11: Sector Analysis (deep sector-level breakdown + strength score)
            if sector_rows:
                print("  ➤ Generating Sector Analysis sheet...")
                df_sector = pd.DataFrame(sector_rows)
                cols = ['Sector'] + [c for c in df_sector.columns if c != 'Sector']
                df_sector = df_sector[cols]
                df_sector.to_excel(writer, sheet_name='Sector_Analysis', index=False)

            # NEW Sheet 12: Industry Analysis (deep industry-level breakdown + strength score)
            if industry_rows:
                print("  ➤ Generating Industry Analysis sheet...")
                df_industry = pd.DataFrame(industry_rows)
                cols = ['Sector', 'Industry'] + [c for c in df_industry.columns if c not in ('Sector', 'Industry')]
                df_industry = df_industry[cols]
                df_industry.to_excel(writer, sheet_name='Industry_Analysis', index=False)

            # NEW Sheet 13: NR Breakout / pattern detail by Sector & Industry (long format for pivoting)
            if nr_detail_rows:
                print("  ➤ Generating NR Breakout Sector/Industry detail sheet...")
                df_nr_detail = pd.DataFrame(nr_detail_rows)
                df_nr_detail.to_excel(writer, sheet_name='NR_Breakout_Sector_Industry', index=False)

            # NEW Sheet 14: Master Stock Data (raw Sector/Industry/Marketcap/Price reference)
            if master_stock_records:
                print("  ➤ Generating Master Stock Data sheet...")
                df_master = pd.DataFrame(master_stock_records)
                df_master.to_excel(writer, sheet_name='Master_Stock_Data', index=False)

            # FAST-SCANNER EXTRA SHEETS (after the original 14): Zone_Levels, Return_Potential
            for sheet_name, sheet_rows in (extra_sheets or {}).items():
                print(f"  ➤ Generating {sheet_name} sheet...")
                pd.DataFrame(sheet_rows).to_excel(writer, sheet_name=sheet_name, index=False)

        new_sheet_count = sum([bool(sector_rows), bool(industry_rows), bool(nr_detail_rows), bool(master_stock_records)])
        print(f"  ✓ Saved: {filename} (10 original sheets + {new_sheet_count} new Sector/Industry sheets)")
        return filename

    except Exception as e:
        print(f"  Error saving {filename}: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return None


def generate_sector_industry_section(sector_rows, industry_rows, nr_detail_rows):
    """Build the Sector/Industry insights block appended to the Telegram message."""
    if not sector_rows and not industry_rows:
        return ""

    msg = f"\n🏭 SECTOR & INDUSTRY ANALYSIS\n"
    msg += f"━━━━━━━━━━━━━━━━━━━━\n"

    if sector_rows:
        msg += f"💪 TOP 5 STRONGEST SECTORS\n"
        for i, r in enumerate(sector_rows[:5], 1):
            msg += f"{i}. {r['Sector']} — Strength {r['Strength_Score']} ({r['Strength_Label']}), Net Bias {r['Net_Bias_Score']:+d}\n"
        msg += "\n"

        if len(sector_rows) > 3:
            msg += f"⚠ WEAKEST 3 SECTORS\n"
            for i, r in enumerate(reversed(sector_rows[-3:]), 1):
                msg += f"{i}. {r['Sector']} — Strength {r['Strength_Score']} ({r['Strength_Label']})\n"
            msg += "\n"

        top_bo_sectors = [r for r in sorted(sector_rows, key=lambda x: x['NR_Breakout_Count'], reverse=True) if r['NR_Breakout_Count'] > 0][:5]
        if top_bo_sectors:
            msg += f"🚀 TOP SECTORS BY NR BREAKOUTS\n"
            for i, r in enumerate(top_bo_sectors, 1):
                msg += f"{i}. {r['Sector']} — {r['NR_Breakout_Count']} breakouts\n"
            msg += "\n"

    if industry_rows:
        top_bo_industries = [r for r in sorted(industry_rows, key=lambda x: x['NR_Breakout_Count'], reverse=True) if r['NR_Breakout_Count'] > 0][:5]
        if top_bo_industries:
            msg += f"🏗 TOP INDUSTRIES BY NR BREAKOUTS\n"
            for i, r in enumerate(top_bo_industries, 1):
                msg += f"{i}. {r['Industry']} ({r['Sector']}) — {r['NR_Breakout_Count']} breakouts\n"
            msg += "\n"

        msg += f"⭐ TOP 5 STRONGEST INDUSTRIES\n"
        for i, r in enumerate(industry_rows[:5], 1):
            msg += f"{i}. {r['Industry']} ({r['Sector']}) — Strength {r['Strength_Score']}\n"
        msg += "\n"

    return msg


def generate_telegram_insights(combined_stock_map, stock_zone_signal_map, stock_nr_signal_map, filename, category_stocks,
                                sector_rows=None, industry_rows=None, nr_detail_rows=None):
    """Generate detailed insights for Telegram message"""

    long_signals, short_signals, retracement_signals, mixed_signals = get_signal_categories()

    # Basic counts
    total_stocks = len(combined_stock_map)
    zone_only = len([t for t, s in combined_stock_map.items() if s['zone_signals'] and not s['nr_signals']])
    nr_only = len([t for t, s in combined_stock_map.items() if s['nr_signals'] and not s['zone_signals']])
    both_signals = len([t for t, s in combined_stock_map.items() if s['zone_signals'] and s['nr_signals']])

    # Bias distribution
    bias_counts = {'LONG': 0, 'SHORT': 0, 'RETRACEMENT': 0, 'MIXED': 0, 'NEUTRAL': 0}

    for ticker, signal_info in combined_stock_map.items():
        zone_signals = signal_info['zone_signals']

        long_count = sum(1 for signal in zone_signals if signal in long_signals)
        short_count = sum(1 for signal in zone_signals if signal in short_signals)
        retracement_count = sum(1 for signal in zone_signals if signal in retracement_signals)

        if retracement_count > 0:
            bias_counts['RETRACEMENT'] += 1
        elif long_count > 0 and short_count > 0:
            bias_counts['MIXED'] += 1
        elif long_count > short_count:
            bias_counts['LONG'] += 1
        elif short_count > long_count:
            bias_counts['SHORT'] += 1
        else:
            bias_counts['NEUTRAL'] += 1

    # Top opportunities (both signals) - ALL STOCKS
    top_opps = []
    for ticker, signal_info in combined_stock_map.items():
        if signal_info['zone_signals'] and signal_info['nr_signals']:
            total = len(signal_info['zone_signals']) + len(signal_info['nr_signals'])
            top_opps.append((ticker, total))

    top_opps.sort(key=lambda x: x[1], reverse=True)
    top_5 = top_opps[:5]

    # Strong conviction stocks - ALL STOCKS
    strong_long = []
    strong_short = []

    for ticker, signal_info in combined_stock_map.items():
        zone_signals = signal_info['zone_signals']
        long_count = sum(1 for signal in zone_signals if signal in long_signals)
        short_count = sum(1 for signal in zone_signals if signal in short_signals)

        if long_count >= 3 and short_count == 0:
            strong_long.append((ticker, long_count))
        elif short_count >= 3 and long_count == 0:
            strong_short.append((ticker, short_count))

    strong_long.sort(key=lambda x: x[1], reverse=True)
    strong_short.sort(key=lambda x: x[1], reverse=True)

    # Multi-timeframe NR stocks - ALL STOCKS
    multi_tf = []
    for stock, nr_signals in stock_nr_signal_map.items():
        if len(nr_signals) > 1:
            timeframes = set()
            for signal in nr_signals:
                if '_W_' in signal or signal.startswith('W_'):
                    timeframes.add('W')
                elif '_M_' in signal or signal.startswith('M_'):
                    timeframes.add('M')
                elif '_Q_' in signal or signal.startswith('Q_'):
                    timeframes.add('Q')
                elif '_Y_' in signal or signal.startswith('Y_'):
                    timeframes.add('Y')
                elif '_D_' in signal or signal.startswith('D_'):
                    timeframes.add('D')

            if len(timeframes) >= 2:
                multi_tf.append((stock, len(timeframes), len(nr_signals)))

    multi_tf.sort(key=lambda x: (x[1], x[2]), reverse=True)

    # FNO stocks only
    fno_stocks = category_stocks.get('FNO', set())

    # Strong conviction FNO stocks - LONG
    strong_long_fno = []
    for ticker, signal_info in combined_stock_map.items():
        if ticker in fno_stocks:
            zone_signals = signal_info['zone_signals']
            long_count = sum(1 for signal in zone_signals if signal in long_signals)
            short_count = sum(1 for signal in zone_signals if signal in short_signals)

            if long_count >= 3 and short_count == 0:
                strong_long_fno.append((ticker, long_count))

    strong_long_fno.sort(key=lambda x: x[1], reverse=True)

    # Strong conviction FNO stocks - SHORT
    strong_short_fno = []
    for ticker, signal_info in combined_stock_map.items():
        if ticker in fno_stocks:
            zone_signals = signal_info['zone_signals']
            long_count = sum(1 for signal in zone_signals if signal in long_signals)
            short_count = sum(1 for signal in zone_signals if signal in short_signals)

            if short_count >= 3 and long_count == 0:
                strong_short_fno.append((ticker, short_count))

    strong_short_fno.sort(key=lambda x: x[1], reverse=True)

    # Build message
    ist_time = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%d %H:%M:%S IST")

    message = f"📊 ChartInk Complete Quant Scan Results\n"
    message += f"━━━━━━━━━━━━━━━━━━━━\n"
    message += f"📅 {ist_time}\n"
    message += f"📁 File: {filename}\n\n"

    message += f"📈 OVERVIEW\n"
    message += f"├ Total Stocks: {total_stocks}\n"
    message += f"├ Zone Only: {zone_only}\n"
    message += f"├ NR Only: {nr_only}\n"
    message += f"└ Both Signals: {both_signals}\n\n"

    message += f"🎯 BIAS DISTRIBUTION\n"
    pct = lambda n: f"{n/total_stocks*100:.1f}%" if total_stocks > 0 else "0.0%"
    message += f"├ 🟢 Long: {bias_counts['LONG']} ({pct(bias_counts['LONG'])})\n"
    message += f"├ 🔴 Short: {bias_counts['SHORT']} ({pct(bias_counts['SHORT'])})\n"
    message += f"├ 🔵 Retracement: {bias_counts['RETRACEMENT']} ({pct(bias_counts['RETRACEMENT'])})\n"
    message += f"├ 🟡 Mixed: {bias_counts['MIXED']} ({pct(bias_counts['MIXED'])})\n"
    message += f"└ ⚪ Neutral: {bias_counts['NEUTRAL']} ({pct(bias_counts['NEUTRAL'])})\n\n"

    # FNO-specific insights
    if strong_long_fno:
        message += f"🟢 TOP 5 FNO STRONG BUYING\n"
        message += f"(F&O Stocks - Long Conviction)\n"
        for i, (ticker, count) in enumerate(strong_long_fno[:5], 1):
            message += f"{i}. {ticker} ({count} long signals)\n"
        message += "\n"

    if strong_short_fno:
        message += f"🔴 TOP 5 FNO STRONG SELLING\n"
        message += f"(F&O Stocks - Short Conviction)\n"
        for i, (ticker, count) in enumerate(strong_short_fno[:5], 1):
            message += f"{i}. {ticker} ({count} short signals)\n"
        message += "\n"

    # Overall market insights
    if top_5:
        message += f"⭐ TOP 5 OPPORTUNITIES (Overall)\n"
        message += f"(Both Zone + NR Signals)\n"
        for i, (ticker, count) in enumerate(top_5, 1):
            message += f"{i}. {ticker} ({count} signals)\n"
        message += "\n"

    if strong_long:
        message += f"💪 TOP 5 STRONG LONG CONVICTION (Overall)\n"
        for i, (ticker, count) in enumerate(strong_long[:5], 1):
            message += f"{i}. {ticker} ({count} long signals)\n"
        message += "\n"

    if strong_short:
        message += f"💪 TOP 5 STRONG SHORT CONVICTION (Overall)\n"
        for i, (ticker, count) in enumerate(strong_short[:5], 1):
            message += f"{i}. {ticker} ({count} short signals)\n"
        message += "\n"

    if multi_tf:
        message += f"🔄 TOP 5 MULTI-TIMEFRAME NR PATTERNS\n"
        for i, (ticker, tf_count, sig_count) in enumerate(multi_tf[:5], 1):
            message += f"{i}. {ticker} ({tf_count} TF, {sig_count} signals)\n"
        message += "\n"

    # NEW: Sector & Industry section
    sector_section = generate_sector_industry_section(sector_rows, industry_rows, nr_detail_rows)
    if sector_section:
        message += sector_section

    return message


# ============================================================================
#   EXTRA SHEETS (appended AFTER the original 14 — nothing above is changed)
#     Zone_Levels       raw zone levels of every stock + position / distance per timeframe
#     Return_Potential  "hidden return": entry = monthly zone breakout, exits = quarterly / yearly zone
#     Price_Health      long-term price quality (POOR / WEAK / HEALTHY) from the yearly candles
#     Failed_NR         failed NR breakout / breakdown, price back at the opposite mother edge (trap)
#     Zone_Retest       last bar closed beyond its own zone, price now back at the current zone's other band
#     Technicals        RSI / ADX / BB / MACD / Supertrend / CCI per timeframe (only when the technical-data scrape worked)
# ============================================================================

_TF_LABEL = {'d': 'D', 'w': 'W', 'm': 'M', 'q': 'Q', 'y': 'Y'}


def _r2(v):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 2)


def build_zone_level_rows(frame, master_stock_data, category_stocks):
    """One row per stock: close, previous closes, 4 zone levels x 5 timeframes, position and % distances."""
    x = _Ctx(frame, category_stocks)
    fno = category_stocks.get('FNO', set())
    n500 = category_stocks.get('Nifty_500', set())
    rows = []
    for i, sym in enumerate(frame['symbol'].tolist()):
        if any(w in sym.lower() for w in exclude_words):
            continue
        c = x.c[i]
        if np.isnan(c):
            continue
        rec = master_stock_data.get(sym, {})
        sector = rec.get('Sector')
        industry = rec.get('Industry')
        if not sector:
            raw_sec = frame['sector'].iloc[i] if 'sector' in frame.columns else None
            sector = str(raw_sec).strip().title() if isinstance(raw_sec, str) and raw_sec.strip() and raw_sec.strip().lower() not in ('n/a', 'na', '-') else 'Unknown'
        if not industry:
            raw_ind = frame['industry'].iloc[i] if 'industry' in frame.columns else None
            industry = str(raw_ind).strip().title() if isinstance(raw_ind, str) and raw_ind.strip() and raw_ind.strip().lower() not in ('n/a', 'na', '-') else 'Unknown'
        row = {
            'Symbol': sym,
            'Stock_Name': rec.get('Stock_Name') or (frame['stock_name'].iloc[i] if 'stock_name' in frame.columns else ''),
            'Sector': sector, 'Industry': industry,
            'Price': _r2(c),
            'Change_Pct': _r2(x.col('pct_change')[i]),
            'Prev_Day_Close': _r2(x.prev('d')[i]), 'Prev_Week_Close': _r2(x.prev('w')[i]),
            'Prev_Month_Close': _r2(x.prev('m')[i]), 'Prev_Quarter_Close': _r2(x.prev('q')[i]),
            'Prev_Year_Close': _r2(x.prev('y')[i]),
        }
        for tf in 'dwmqy':
            L = _TF_LABEL[tf]
            tz, tn, bz, bn = x.z[tf]['tz'][i], x.z[tf]['tn'][i], x.z[tf]['bz'][i], x.z[tf]['bn'][i]
            row[f'{L}_Top_Zone'], row[f'{L}_Top_Near'] = _r2(tz), _r2(tn)
            row[f'{L}_Bottom_Near'], row[f'{L}_Bottom_Zone'] = _r2(bn), _r2(bz)
            if np.isnan(tz) or np.isnan(bz):
                pos = 'NO_DATA'
            elif c > tz:
                pos = 'ABOVE_TOP'
            elif c >= tn:
                pos = 'IN_TOP_BAND'
            elif c < bz:
                pos = 'BELOW_BOTTOM'
            elif c <= bn:
                pos = 'IN_BOTTOM_BAND'
            else:
                pos = 'INSIDE'
            row[f'{L}_Position'] = pos
            row[f'{L}_Dist_Top_Pct'] = _r2((tz / c - 1) * 100) if not np.isnan(tz) else None      # + = zone top is above price
            row[f'{L}_Dist_Bottom_Pct'] = _r2((bz / c - 1) * 100) if not np.isnan(bz) else None   # - = zone bottom is below price
        row['Is_FNO'] = 'Yes' if sym in fno else 'No'
        row['Is_Nifty_500'] = 'Yes' if sym in n500 else 'No'
        rows.append(row)
    return rows


def build_return_potential_rows(zone_rows, health_rows=None):
    """
    HIDDEN RETURN — potential move if you enter on the MONTHLY zone breakout and exit at the
    QUARTERLY / YEARLY zone.
      LONG : entry = Monthly top_zone      stop = Monthly top_near (band)   targets = Quarterly / Yearly top_zone
      SHORT: entry = Monthly bottom_zone   stop = Monthly bottom_near       targets = Quarterly / Yearly bottom_zone
    A row is written only when at least one target lies beyond the entry in the trade direction.
    """
    health = {h['Symbol']: h['Health'] for h in (health_rows or [])}
    out = []
    for z in zone_rows:
        c = z['Price']
        for direction in ('LONG', 'SHORT'):
            if direction == 'LONG':
                entry = z['M_Top_Zone']
                stop = z['M_Top_Near']
                tq, ty = z['Q_Top_Zone'], z['Y_Top_Zone']
                sign = 1
            else:
                entry = z['M_Bottom_Zone']
                stop = z['M_Bottom_Near']
                tq, ty = z['Q_Bottom_Zone'], z['Y_Bottom_Zone']
                sign = -1
            if not entry or not c:
                continue
            ret = lambda t: _r2(sign * (t / entry - 1) * 100) if t else None
            rem = lambda t: _r2(sign * (t / c - 1) * 100) if t else None
            rq, ry = ret(tq), ret(ty)
            rq = rq if rq is not None and rq > 0 else None
            ry = ry if ry is not None and ry > 0 else None
            if rq is None and ry is None:
                continue
            risk = _r2(abs(entry - stop) / entry * 100) if stop else None
            dist = _r2(sign * (entry / c - 1) * 100)          # + = price still has to travel to the entry
            beyond_entry = (c >= entry) if sign > 0 else (c <= entry)
            hit_q = rq is not None and ((c >= tq) if sign > 0 else (c <= tq))   # only a VALID target (beyond entry) can be "hit"
            hit_y = ry is not None and ((c >= ty) if sign > 0 else (c <= ty))
            if hit_y:
                status = 'Target Y Hit'
            elif hit_q:
                status = 'Target Q Hit'
            elif beyond_entry:
                status = 'Triggered'
            elif dist is not None and dist <= NEAR_ENTRY_PCT:
                status = 'Near Entry'
            else:
                status = 'Waiting'
            best = max(v for v in (rq, ry) if v is not None)
            out.append({
                'Symbol': z['Symbol'], 'Stock_Name': z['Stock_Name'], 'Sector': z['Sector'], 'Industry': z['Industry'],
                'Direction': direction, 'Price': c, 'Status': status,
                'Entry_Monthly_Zone': entry, 'Stop': stop, 'Target_Quarterly': tq, 'Target_Yearly': ty,
                'Return_To_Q_Pct': rq, 'Return_To_Y_Pct': ry, 'Best_Return_Pct': best,
                'Remaining_To_Q_Pct': rem(tq) if rq is not None else None,
                'Remaining_To_Y_Pct': rem(ty) if ry is not None else None,
                'Risk_Pct': risk,
                'RR_Q': _r2(rq / risk) if rq is not None and risk else None,
                'RR_Y': _r2(ry / risk) if ry is not None and risk else None,
                'Distance_To_Entry_Pct': dist,
                'Is_FNO': z['Is_FNO'], 'Is_Nifty_500': z['Is_Nifty_500'],
                'Health': health.get(z['Symbol'], ''),
            })
    out.sort(key=lambda r: r['Best_Return_Pct'], reverse=True)
    return out


def build_price_health_rows(frame, zone_rows):
    """PRICE HEALTH — long-term quality of every stock from its yearly candles (rule in SETTINGS)."""
    x = _Ctx(frame)
    H = x.ohlc_matrix('y', 'high')
    L = x.ohlc_matrix('y', 'low')
    C = x.ohlc_matrix('y', 'close')
    ML = x.ohlc_matrix('m', 'low')          # this month + the last 12 months
    idx = {sym: i for i, sym in enumerate(frame['symbol'].tolist())}
    out = []
    for z in zone_rows:
        i = idx.get(z['Symbol'])
        c = z['Price']
        if i is None or not c:
            continue
        highs = H[i]
        valid = ~np.isnan(highs)
        if not valid.any():
            continue
        peak_bar = int(np.nanargmax(highs))
        peak = float(highs[peak_bar])
        years = int(valid.sum())
        dd = (c / peak - 1) * 100 if peak > 0 else None
        c_old = C[i, HEALTH_WEAK_YEARS] if C.shape[1] > HEALTH_WEAK_YEARS else np.nan
        r_old = (c / c_old - 1) * 100 if not np.isnan(c_old) and c_old > 0 else None
        c3 = C[i, 3]
        r3 = (c / c3 - 1) * 100 if not np.isnan(c3) and c3 > 0 else None
        # worst crash in the history: each year's low vs the highest high of the years before it (oldest → now)
        run_peak, crash, crash_bar, crash_from, crash_to = None, 0.0, None, None, None
        for j in range(H.shape[1] - 1, -1, -1):
            hj, lj = H[i, j], L[i, j]
            if np.isnan(hj) or np.isnan(lj) or lj <= 0:
                continue
            if run_peak:
                d = (lj / run_peak - 1) * 100
                if d < crash:
                    crash, crash_bar, crash_from, crash_to = d, j, run_peak, lj
            run_peak = max(run_peak or 0, hj)
        lows3 = L[i, :4]
        low3 = float(np.nanmin(lows3)) if not np.isnan(lows3).all() else np.nan
        run_up = c / low3 if low3 > 0 else None
        mlows = ML[i][ML[i] > 0]
        run_1y = c / float(mlows.min()) if mlows.size else None
        crash_txt = (f"crashed {-crash:.0f}% ({crash_from:,.2f} → {crash_to:,.2f}, "
                     f"{'this year' if crash_bar == 0 else f'{crash_bar} year' + ('s' if crash_bar > 1 else '') + ' ago'})") if crash_bar is not None else ""

        reasons, poor = [], []
        if dd is not None and dd <= -HEALTH_POOR_DRAWDOWN_PCT:
            poor.append(f"{-dd:.0f}% below its {peak_bar}-year-ago peak of {peak:,.2f}" if peak_bar
                        else f"{-dd:.0f}% below this year's peak of {peak:,.2f}")
        if crash <= -HEALTH_CRASH_POOR_PCT and crash_bar is not None and crash_bar <= HEALTH_CRASH_RECENT_YEARS:
            poor.append(crash_txt)
        elif crash <= -HEALTH_CRASH_WEAK_PCT and run_up is not None and run_up >= HEALTH_ROUNDTRIP_X:
            poor.append(f"{crash_txt}, then {run_up:.0f}x from its 3-year low")
        if run_1y is not None and run_1y >= HEALTH_STRETCH_POOR_X:
            poor.append(f"parabolic: {run_1y:.1f}x its 1-year low — very stretched, sharp falls are common")
        if poor:
            status, reasons = 'POOR', poor
        else:
            if dd is not None and dd <= -HEALTH_WEAK_DRAWDOWN_PCT:
                reasons.append(f"{-dd:.0f}% below its peak of {peak:,.2f}")
            if r_old is not None and r_old < 0:
                reasons.append(f"lower than {HEALTH_WEAK_YEARS} years ago ({r_old:.0f}%)")
            if crash <= -HEALTH_CRASH_WEAK_PCT:
                reasons.append(crash_txt)
            if run_up is not None and run_up >= HEALTH_RUNUP_WEAK_X:
                reasons.append(f"{run_up:.0f}x its 3-year low — a very fast run-up")
            if run_1y is not None and run_1y >= HEALTH_STRETCH_WEAK_X:
                reasons.append(f"stretched: {run_1y:.1f}x its 1-year low")
            status = 'WEAK' if reasons else 'HEALTHY'
        out.append({
            'Symbol': z['Symbol'], 'Stock_Name': z['Stock_Name'], 'Sector': z['Sector'], 'Industry': z['Industry'],
            'Price': c, 'Health': status,
            'Peak_High': _r2(peak), 'Peak_Years_Ago': peak_bar,
            'Drawdown_From_Peak_Pct': _r2(dd),
            f'Return_{HEALTH_WEAK_YEARS}Y_Pct': _r2(r_old), 'Return_3Y_Pct': _r2(r3),
            'Worst_Crash_Pct': _r2(crash) if crash_bar is not None else None, 'Worst_Crash_Years_Ago': crash_bar,
            'Run_Up_From_3Y_Low_X': _r2(run_up), 'Run_Up_1Y_X': _r2(run_1y),
            'Stretched': 'Yes' if run_1y is not None and run_1y >= HEALTH_STRETCH_WEAK_X else 'No',
            'Years_Of_History': years,
            'Reason': '; '.join(reasons) if reasons else 'price holds up well against its history',
            'Is_FNO': z['Is_FNO'], 'Is_Nifty_500': z['Is_Nifty_500'],
        })
    order = {'POOR': 0, 'WEAK': 1, 'HEALTHY': 2}
    out.sort(key=lambda r: (order[r['Health']], r['Drawdown_From_Peak_Pct'] if r['Drawdown_From_Peak_Pct'] is not None else 0))
    return out


def build_failed_nr_rows(frame, zone_rows, health_rows=None):
    """FAILED NR / TRAP — breakout (or breakdown) of the mother candle failed, price is back at the
    opposite edge of the mother candle (rule in SETTINGS)."""
    x = _Ctx(frame)
    lengths = defaultdict(set)
    for name in nr_urls:
        m = _NR_RE.match(name)
        if m:
            lengths[m.group(1).upper()].add(int(m.group(2)))
    zinfo = {z['Symbol']: z for z in zone_rows}
    health = {h['Symbol']: h['Health'] for h in (health_rows or [])}
    syms = frame['symbol'].tolist()
    found = {}      # (symbol, tf) -> row with the biggest mother

    for tf in 'dwmqy':
        ns = sorted((n for n in lengths.get(tf.upper(), ()) if n <= 12), reverse=True)
        if not ns:
            continue
        O, H, L, C = (x.ohlc_matrix(tf, f) for f in ('open', 'high', 'low', 'close'))
        c0 = np.where(np.isnan(C[:, 0]), x.c, C[:, 0])
        for n in ns:
            mh, ml, mo, mc = H[:, n], L[:, n], O[:, n], C[:, n]
            rng = mh - ml
            mother_ok = np.abs(mo - mc) >= rng * (NR_MOTHER_BODY_PCT / 100)
            inside_now = (c0 >= ml) & (c0 <= mh)
            for side in ('BO', 'BD'):
                ok = mother_ok & inside_now
                failed_any = np.zeros(x.n, dtype=bool)
                last_fail = np.full(x.n, -1)
                for i in range(n - 1, 0, -1):          # oldest -> newest so last_fail ends on the latest failure
                    body_in = (O[:, i] <= mh) & (O[:, i] >= ml) & (C[:, i] <= mh) & (C[:, i] >= ml)
                    fail = (C[:, i] > mh) if side == 'BO' else (C[:, i] < ml)
                    wrong = (C[:, i] < ml) if side == 'BO' else (C[:, i] > mh)
                    ok &= (body_in | fail) & ~wrong
                    failed_any |= fail
                    last_fail = np.where(fail, i, last_fail)
                ok &= failed_any
                ok &= (c0 <= ml / NR_NEAR_RATIO) if side == 'BO' else (c0 >= mh * NR_NEAR_RATIO)
                for k in np.flatnonzero(ok):
                    sym = syms[k]
                    if sym not in zinfo or (sym, tf) in found:
                        continue
                    z = zinfo[sym]
                    price, hi, lo = float(c0[k]), float(mh[k]), float(ml[k])
                    if side == 'BO':
                        trade, stop, target = 'LONG', lo, hi
                        risk, reward = (price - stop) / price * 100, (target - price) / price * 100
                    else:
                        trade, stop, target = 'SHORT', hi, lo
                        risk, reward = (stop - price) / price * 100, (price - target) / price * 100
                    fb = int(last_fail[k])
                    found[(sym, tf)] = {
                        'Symbol': sym, 'Stock_Name': z['Stock_Name'], 'Sector': z['Sector'], 'Industry': z['Industry'],
                        'Price': _r2(price), 'Timeframe': _TF_LABEL[tf],
                        'Trap': 'Failed BO -> back at mother Low' if side == 'BO' else 'Failed BD -> back at mother High',
                        'Trade': trade, 'Mother_Bars_Ago': n, 'Mother_High': _r2(hi), 'Mother_Low': _r2(lo),
                        'Failure_Bars_Ago': fb, 'Failure_Close': _r2(C[k, fb]),
                        'Position_In_Mother_Pct': _r2((price - lo) / (hi - lo) * 100) if hi > lo else None,
                        'Entry': _r2(price), 'Stop': _r2(stop), 'Target': _r2(target),
                        'Risk_Pct': _r2(risk), 'Reward_Pct': _r2(reward),
                        'RR': _r2(reward / risk) if risk > 0 else None,
                        'Health': health.get(sym, ''),
                        'Is_FNO': z['Is_FNO'], 'Is_Nifty_500': z['Is_Nifty_500'],
                    }
    rows = list(found.values())
    tf_rank = {'Y': 0, 'Q': 1, 'M': 2, 'W': 3, 'D': 4}
    rows.sort(key=lambda r: (tf_rank[r['Timeframe']], -(r['RR'] or 0)))
    return rows


def build_zone_retest_rows(frame, zone_rows, health_rows=None):
    """ZONE RETEST — the last bar closed beyond its own zone, price is now back at the current zone's
    opposite band (rule in SETTINGS)."""
    x = _Ctx(frame)
    zinfo = {z['Symbol']: z for z in zone_rows}
    health = {h['Symbol']: h['Health'] for h in (health_rows or [])}
    syms = frame['symbol'].tolist()
    rows = []
    for tf in ZONE_RETEST_TFS:
        prev_close = x.prev(tf)
        prev_top, prev_bot = x.vzone(tf, 'top', 1), x.vzone(tf, 'bottom', 1)
        tz, tn, bz, bn = x.z[tf]['tz'], x.z[tf]['tn'], x.z[tf]['bz'], x.z[tf]['bn']
        for trade, mask in (('LONG', (prev_close > prev_top) & x.in_band(x.bottom(tf))),
                            ('SHORT', (prev_close < prev_bot) & x.in_band(x.top(tf)))):
            for k in np.flatnonzero(mask):
                sym = syms[k]
                if sym not in zinfo:
                    continue
                z, price = zinfo[sym], float(x.c[k])
                edge = bz[k] if trade == 'LONG' else tz[k]
                rows.append({
                    'Symbol': sym, 'Stock_Name': z['Stock_Name'], 'Sector': z['Sector'], 'Industry': z['Industry'],
                    'Price': _r2(price), 'Timeframe': _TF_LABEL[tf], 'Trade': trade,
                    'Setup': (f"Closed above last {_TF_LABEL[tf]} zone -> back at current zone bottom" if trade == 'LONG'
                              else f"Closed below last {_TF_LABEL[tf]} zone -> back at current zone top"),
                    'Prev_Close': _r2(prev_close[k]), 'Prev_Zone_Top': _r2(prev_top[k]), 'Prev_Zone_Bottom': _r2(prev_bot[k]),
                    'Zone_Top': _r2(tz[k]), 'Zone_Top_Near': _r2(tn[k]), 'Zone_Bottom_Near': _r2(bn[k]), 'Zone_Bottom': _r2(bz[k]),
                    'Dist_To_Zone_Edge_Pct': _r2(abs(price - edge) / price * 100) if price else None,
                    'Health': health.get(sym, ''),
                    'Is_FNO': z['Is_FNO'], 'Is_Nifty_500': z['Is_Nifty_500'],
                })
    tf_rank = {'Y': 0, 'Q': 1, 'M': 2, 'W': 3}
    rows.sort(key=lambda r: (tf_rank[r['Timeframe']], r['Dist_To_Zone_Edge_Pct'] if r['Dist_To_Zone_Edge_Pct'] is not None else 99))
    return rows


def build_technical_rows(frame, zone_rows):
    """One row per stock: price + RSI / ADX / BB upper / BB lower / MACD / Supertrend / CCI for D W M Q Y
    (raw values from the technical-data screener; bullish / bearish levels are set in the dashboard's Admin tab)."""
    cols = [f"tech_{tf}_{ind}" for tf in 'dwmqy' for ind in TECH_INDICATORS]
    if not any(c in frame.columns for c in cols):
        return []
    x = _Ctx(frame)
    zinfo = {z['Symbol']: z for z in zone_rows}
    label = {'rsi': 'RSI', 'adx': 'ADX', 'bbu': 'BB_Upper', 'bbl': 'BB_Lower', 'macd': 'MACD', 'st': 'Supertrend', 'cci': 'CCI'}
    rows = []
    for i, sym in enumerate(frame['symbol'].tolist()):
        if sym not in zinfo:
            continue
        row = {'Symbol': sym, 'Price': _r2(x.c[i])}
        have = False
        for tf in 'dwmqy':
            for ind in TECH_INDICATORS:
                v = _r2(x.col(f"tech_{tf}_{ind}")[i])
                row[f"{_TF_LABEL[tf]}_{label[ind]}"] = v
                have = have or v is not None
        if have:
            rows.append(row)
    return rows


def append_extra_sheets(filename, frame, master_stock_data, category_stocks):
    """Append Zone_Levels + Return_Potential to the already-saved workbook."""
    try:
        zone_rows = build_zone_level_rows(frame, master_stock_data, category_stocks)
        health_rows = build_price_health_rows(frame, zone_rows)
        ret_rows = build_return_potential_rows(zone_rows, health_rows)
        failed_rows = build_failed_nr_rows(frame, zone_rows, health_rows)
        retest_rows = build_zone_retest_rows(frame, zone_rows, health_rows)
        tech_rows = build_technical_rows(frame, zone_rows)
        with pd.ExcelWriter(filename, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            pd.DataFrame(zone_rows).to_excel(writer, sheet_name='Zone_Levels', index=False)
            pd.DataFrame(ret_rows).to_excel(writer, sheet_name='Return_Potential', index=False)
            pd.DataFrame(health_rows).to_excel(writer, sheet_name='Price_Health', index=False)
            pd.DataFrame(failed_rows).to_excel(writer, sheet_name='Failed_NR', index=False)
            pd.DataFrame(retest_rows).to_excel(writer, sheet_name='Zone_Retest', index=False)
            if tech_rows:
                pd.DataFrame(tech_rows).to_excel(writer, sheet_name='Technicals', index=False)
        n_long = sum(1 for r in ret_rows if r['Direction'] == 'LONG')
        print(f"  ✓ Added Zone_Levels ({len(zone_rows)} stocks) + Return_Potential ({n_long} long / {len(ret_rows) - n_long} short setups)")
        return True
    except Exception as e:
        import traceback
        print(f"  ⚠ Could not add extra sheets: {e}\n{traceback.format_exc()}")
        return False


# ============================================================================
#   MAIN FLOW  (fast version)
# ============================================================================
def attempt_scraping(attempt_num, credentials, offline_dir=None, send_to_telegram=True,
                     validate=False, validate_only='all', validate_limit=None, validate_filter=None):
    """One full run: 4 raw tables (+ index lists + master) -> calculate -> same Excel -> Telegram"""
    current_step = "Initialization"
    t0 = time.time()

    try:
        print(f"\n{'='*60}")
        print(f"FAST SCAN ATTEMPT {attempt_num}/{MAX_RETRIES}" + (f"  [OFFLINE: {offline_dir}]" if offline_dir else ""))
        print(f"{'='*60}\n")

        category_stocks = {}
        master_stock_data, master_stock_records = {}, []

        if offline_dir:
            current_step = "Loading saved snapshot"
            raw_texts, category_stocks, master_stock_records = load_snapshot(offline_dir)
            master_stock_data = {r['Symbol']: r for r in master_stock_records}
        else:
            if not SELENIUM_AVAILABLE:
                raise Exception("selenium is not installed (pip install selenium) — or use --offline <snapshot_dir>")

            snapshot_dir = None
            if SAVE_RAW_SNAPSHOT:
                snapshot_dir = f"raw_{datetime.now().strftime('%Y%m%d')}"
                os.makedirs(snapshot_dir, exist_ok=True)

            current_step = "Scraping raw tables + index lists"
            if USE_PARALLEL_PROCESSING:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    f_raw = executor.submit(scrape_raw_tables, RAW_DATA_URLS, snapshot_dir)
                    f_cat = executor.submit(scrape_category_stocks, capital_urls)
                    raw_texts = f_raw.result()
                    category_stocks = f_cat.result()
            else:
                raw_texts = scrape_raw_tables(RAW_DATA_URLS, snapshot_dir)
                category_stocks = scrape_category_stocks(capital_urls)

            if USE_MASTER_SCRAPE:
                current_step = "Scraping Master Stock Data"
                try:
                    master_stock_data, master_stock_records = scrape_master_stock_data(master_data_urls)
                except Exception as e:
                    print(f"  ⚠ Master scrape failed ({e}) — building it from raw-data-5")

        print(f"\n⏱ Data collection: {time.time() - t0:.0f}s")

        current_step = "Building market frame"
        print(f"\n{'*'*60}")
        print("PHASE 2: CALCULATING ALL ZONE + NR SCENARIOS")
        print(f"{'*'*60}")
        t1 = time.time()
        frame = build_market_frame(raw_texts)

        if not master_stock_records:
            master_stock_data, master_stock_records = master_from_raw(frame, category_stocks)
            print(f"  • Master_Stock_Data built from raw-data-5 ({len(master_stock_records)} stocks)")

        if not offline_dir and SAVE_RAW_SNAPSHOT:
            save_snapshot_extras(snapshot_dir, category_stocks, master_stock_records)

        current_step = "Calculating signals"
        stock_zone_signal_map, stock_nr_signal_map = compute_all_signals(frame, category_stocks)
        print(f"⏱ Calculation: {time.time() - t1:.1f}s")

        # ---- from here on: EXACTLY the same report pipeline as before ----
        current_step = "Generating Excel Analysis"
        print(f"\n{'*'*60}")
        print("PHASE 3: GENERATING ENHANCED ANALYSIS")
        print(f"{'*'*60}")

        combined_stock_map, detailed_output = generate_enhanced_analysis(
            stock_zone_signal_map, stock_nr_signal_map, zone_urls, nr_urls, category_stocks
        )

        current_step = "Generating Sector & Industry Analysis"
        sector_rows, industry_rows, nr_detail_rows = build_sector_industry_analysis(
            master_stock_data, stock_zone_signal_map, stock_nr_signal_map
        )

        current_step = "Building Zone_Levels + Price_Health + Return_Potential + Failed_NR + Zone_Retest"
        zone_level_rows = build_zone_level_rows(frame, master_stock_data, category_stocks)
        health_rows = build_price_health_rows(frame, zone_level_rows)
        return_rows = build_return_potential_rows(zone_level_rows, health_rows)
        failed_nr_rows = build_failed_nr_rows(frame, zone_level_rows, health_rows)
        retest_rows = build_zone_retest_rows(frame, zone_level_rows, health_rows)
        tech_rows = build_technical_rows(frame, zone_level_rows)
        n_long = sum(1 for r in return_rows if r['Direction'] == 'LONG')
        n_poor = sum(1 for r in health_rows if r['Health'] == 'POOR')
        n_weak = sum(1 for r in health_rows if r['Health'] == 'WEAK')
        print(f"  • Zone_Levels: {len(zone_level_rows)} stocks | Return_Potential: {n_long} long / {len(return_rows) - n_long} short setups")
        print(f"  • Price_Health: {n_poor} poor, {n_weak} weak, {len(health_rows) - n_poor - n_weak} healthy")
        print(f"  • Failed_NR: {len(failed_nr_rows)} trap setups")
        print(f"  • Zone_Retest: {len(retest_rows)} retest setups")
        print(f"  • Technicals: {len(tech_rows)} stocks" if tech_rows else "  • Technicals: no technical-data table this run")

        current_step = "Saving Excel"
        filename = save_excel_with_enhanced_sheets(
            combined_stock_map, detailed_output, zone_urls, nr_urls,
            stock_zone_signal_map, stock_nr_signal_map, category_stocks,
            sector_rows=sector_rows, industry_rows=industry_rows,
            nr_detail_rows=nr_detail_rows, master_stock_records=master_stock_records,
            extra_sheets={'Zone_Levels': zone_level_rows, 'Return_Potential': return_rows,
                          'Price_Health': health_rows, 'Failed_NR': failed_nr_rows,
                          'Zone_Retest': retest_rows,
                          **({'Technicals': tech_rows} if tech_rows else {})}
        )
        if not filename:
            raise Exception("Failed to generate Excel file")

        if validate:
            current_step = "Validating against original screeners"
            validate_against_chartink(stock_zone_signal_map, stock_nr_signal_map,
                                      only=validate_only, limit=validate_limit, name_filter=validate_filter)

        if send_to_telegram:
            current_step = "Sending to Telegram"
            print(f"\n{'*'*60}")
            print("PHASE 4: SENDING TO TELEGRAM")
            print(f"{'*'*60}")
            insights_message = generate_telegram_insights(
                combined_stock_map, stock_zone_signal_map, stock_nr_signal_map, filename, category_stocks,
                sector_rows=sector_rows, industry_rows=industry_rows, nr_detail_rows=nr_detail_rows
            )
            insights_message += f"\n⚡ Fast scan: {time.time() - t0:.0f}s total"
            asyncio.run(send_telegram_file(
                credentials['bot_token'], credentials['chat_id'], filename, insights_message
            ))

        print(f"\n{'='*60}")
        print(f"✓✓✓ DONE in {time.time() - t0:.0f}s — {filename} ✓✓✓")
        print(f"{'='*60}\n")
        return True, None

    except TimeoutException as e:
        error_msg = f"Timeout at step: {current_step}\nDetails: {str(e)}"
        print(f"⚠ Timeout error: {error_msg}")
        return False, error_msg

    except WebDriverException as e:
        error_msg = f"WebDriver error at step: {current_step}\nDetails: {str(e)}"
        print(f"⚠ WebDriver error: {error_msg}")
        return False, error_msg

    except Exception as e:
        error_msg = f"Error at step: {current_step}\nDetails: {str(e)}"
        print(f"⚠ Error: {error_msg}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return False, error_msg


def run_chartink_scraper(args=None):
    """Main function with retry logic (same behaviour as before)"""
    args = args or argparse.Namespace(offline=None, no_telegram=False, validate=False,
                                      only='all', limit=None, filter=None)
    send = not args.no_telegram
    credentials = {'bot_token': 'NIL', 'chat_id': 'NIL'}

    if send:
        if not TELEGRAM_AVAILABLE:
            print("❌ python-telegram-bot not installed (pip install python-telegram-bot) — or use --no-telegram")
            return
        if not create_config_if_not_exists():
            return
        credentials = load_config()
        for key, value in credentials.items():
            if value == 'NIL':
                print(f"❌ Please update {key} in the config.ini file")
                return

    failure_logs = []
    for attempt in range(1, MAX_RETRIES + 1):
        success, error_msg = attempt_scraping(
            attempt, credentials, offline_dir=args.offline, send_to_telegram=send,
            validate=args.validate, validate_only=args.only, validate_limit=args.limit,
            validate_filter=args.filter)
        if success:
            return
        failure_logs.append(f"Attempt {attempt}: {error_msg}")

        if send and error_msg:
            attempt_fail_msg = f"⚠ ChartInk FAST Scan Attempt {attempt}/{MAX_RETRIES} Failed\n\n"
            attempt_fail_msg += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            attempt_fail_msg += f"Failed Step: {error_msg.split('Details:')[0].strip()}\n"
            if attempt < MAX_RETRIES:
                attempt_fail_msg += f"\n🔄 Retrying in {10 * attempt} seconds..."
            try:
                asyncio.run(send_telegram_message(credentials['bot_token'], credentials['chat_id'], attempt_fail_msg))
            except Exception:
                pass

        if attempt < MAX_RETRIES:
            wait_time = 10 * attempt
            print(f"\n⏳ Waiting {wait_time} seconds before retry {attempt + 1}...")
            time.sleep(wait_time)

    print(f"\n{'='*60}")
    print(f"❌❌❌ SCAN FAILED AFTER {MAX_RETRIES} ATTEMPTS ❌❌❌")
    print(f"{'='*60}\n")

    if send:
        error_message = f"❌ ChartInk FAST Scan FAILED\n\n"
        error_message += f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        error_message += f"Total Attempts: {MAX_RETRIES}\n\nFailure Log:\n━━━━━━━━━━━━━━━━━━━━\n"
        for i, log in enumerate(failure_logs, 1):
            step_name = log.split("Details:")[0].replace(f"Attempt {i}: ", "").strip()
            error_message += f"\n{i}. {step_name}\n"
        error_message += "\n━━━━━━━━━━━━━━━━━━━━\n⚠ Action Required:\n• Check server logs\n"
        error_message += "• Verify network connectivity\n• Check ChartInk website status"
        try:
            asyncio.run(send_telegram_message(credentials['bot_token'], credentials['chat_id'], error_message))
        except Exception:
            print("Failed to send failure notification to Telegram")


def _parse_args(argv=None):
    p = argparse.ArgumentParser(description="ChartInk FAST quant scanner")
    p.add_argument('--offline', metavar='SNAPSHOT_DIR', help="recalculate from a saved raw_YYYYMMDD folder (no browser)")
    p.add_argument('--no-telegram', action='store_true', help="do not send to Telegram")
    p.add_argument('--validate', action='store_true', help="also scrape the old screeners and compare (slow)")
    p.add_argument('--only', choices=['all', 'zone', 'nr'], default='all', help="validation scope")
    p.add_argument('--limit', type=int, default=None, help="validate only the first N screeners")
    p.add_argument('--filter', default=None, help="validate only screeners whose name contains this text")
    return p.parse_args(argv)


if __name__ == "__main__":
    run_chartink_scraper(_parse_args())
