"""
Sign-up screening (owner 2026-11-07: "there is a test profile with fake details … I want only true customers, without my review in
production, with a proper notification and approval").

What a new sign-up goes through (portal.py /app/api/register → mailer.py functions):
  1. refused at once: throw-away mail services, and phone numbers that cannot be real (all one digit, 1234567890 …)
  2. the account is created PENDING and an email with a one-time link goes to the address — nothing works until it is opened
     (the link proves the address is the person's own; it sits after # so a mail scanner's prefetch cannot use it up)
  3. opening the link: if nothing looks fake and Admin has "Approve automatically" on, the account is approved and the customer is
     told by email; otherwise it waits and the owner gets a Telegram message with the reasons (screen() flags) to approve or block
  4. the admin's own Approve also emails the customer
No outside service is needed. A phone one-time code would need a paid SMS / WhatsApp provider; the number is checked for shape only.
"""
import re

# throw-away / temporary mail services (a short list of the common ones; Admin can still approve a rare unlisted one by hand)
DISPOSABLE = {
    "mailinator.com", "10minutemail.com", "10minutemail.net", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com",
    "grr.la", "yopmail.com", "yopmail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "tempmailo.com", "throwawaymail.com",
    "trashmail.com", "trashmail.net", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com", "mintemail.com",
    "fakeinbox.com", "fakemail.net", "emailondeck.com", "mohmal.com", "moakt.com", "mytemp.email", "tmail.ws", "tmpmail.org", "tmpmail.net",
    "burnermail.io", "spamgourmet.com", "mailcatch.com", "inboxkitten.com", "discard.email", "dropmail.me", "emailfake.com", "fake-mail.net",
    "harakirimail.com", "jetable.org", "mail.tm", "mailpoof.com", "mvrht.net", "owlymail.com", "spambox.us", "trbvm.com", "wegwerfmail.de",
    "33mail.com", "anonaddy.com", "guerrillamailblock.com", "cock.li", "byom.de", "email-fake.com", "tempinbox.com", "temporary-mail.net",
}
PLACEHOLDER_DOMAINS = {"test.com", "test.in", "example.com", "example.org", "example.net", "abc.com", "xyz.com", "domain.com", "email.com",
                       "mail.com", "fake.com", "asdf.com", "qwerty.com", "sample.com", "yourdomain.com", "company.com", "gmial.com", "gmai.com"}
JUNK_LOCAL = {"test", "testing", "tester", "demo", "fake", "abc", "abcd", "xyz", "asdf", "qwerty", "user", "sample", "admin", "noname", "none",
              "na", "no", "nothing", "email", "mail", "hello", "hi", "aaa", "xxx", "temp", "dummy", "random"}
JUNK_NAME = {"test", "testing", "tester", "demo", "fake", "abc", "abcd", "xyz", "asdf", "qwerty", "user", "name", "sample", "dummy", "none",
             "na", "no", "hello", "admin", "aaa", "xxx", "temp", "random", "unknown"}


def _digits(phone):
    return re.sub(r"\D", "", phone or "")


def national_number(phone):
    """the national part of '+91 9876543210' → '9876543210'"""
    m = re.match(r"^\+(\d{1,3})\s+(\d{5,13})$", (phone or "").strip())
    return m.group(2) if m else _digits(phone)[-10:]


def _sequential(d):
    asc = "0123456789" * 2
    desc = "9876543210" * 2
    return len(d) >= 6 and (d in asc or d in desc)


def refuse(email, phone):
    """a reason to refuse the sign-up right now (shown to the person), or None"""
    domain = (email or "").rsplit("@", 1)[-1].lower()
    if domain in DISPOSABLE or any(domain.endswith("." + x) for x in DISPOSABLE):
        return "Please use your own permanent email address — temporary mail services are not accepted."
    n = national_number(phone)
    if n and (len(set(n)) == 1 or _sequential(n)):
        return "Please enter your real WhatsApp number."
    return None


def screen(name, email, phone):
    """reasons this sign-up looks fake (empty = nothing found): the account then waits for the owner after the email is confirmed"""
    flags = []
    local, _, domain = (email or "").lower().partition("@")
    base = re.sub(r"[\d._+-]", "", local)
    if domain in PLACEHOLDER_DOMAINS:
        flags.append(f"placeholder email domain ({domain})")
    parts = [x for x in re.split(r"[\d._+-]+", local) if x]                       # john.test, test_user, demo123 …
    if base in JUNK_LOCAL or any(x in JUNK_LOCAL for x in parts) or re.fullmatch(r"(.)\1{2,}", base or "x") or (len(local) <= 2):
        flags.append("test-like email name")
    n = national_number(phone)
    if n:
        top = max(n.count(c) for c in set(n))
        if top >= 7:
            flags.append("phone number repeats one digit")
        elif _sequential(n[:6]) or _sequential(n[-6:]):
            flags.append("phone number looks like a sequence")
    nm = " ".join((name or "").split())
    words = [w.lower() for w in nm.split()]
    if not words or all(w in JUNK_NAME for w in words):
        flags.append("name looks like a placeholder")
    elif len(words) == 1 and len(words[0]) < 3:
        flags.append("name is very short")
    if re.search(r"\d", nm):
        flags.append("name has digits")
    if re.search(r"(.)\1{3,}", nm.lower()):
        flags.append("name repeats a letter")
    if nm and not re.search(r"[aeiouyAEIOUY]", nm) and len(nm) > 3:
        flags.append("name has no vowels")
    return flags


# ─────────────────────────────── validation (round 17c, owner 2026-11-07) ───────────────────────────────
# "the email must be a Gmail id — no other, no corporate id · no numeric character in the name · all proper validation, no SQL injection".
# Every value is checked HERE (the page checks the same rules only to help the person; the server never trusts it). All database access
# elsewhere uses bound parameters; these checks add a second wall: control / invisible characters, NUL bytes, over-long values, markup
# characters and look-alike letters never reach a query or an email.
import unicodedata

GMAIL_RE = re.compile(r"^(?=[a-z0-9.]{6,30}@)[a-z0-9](?:[a-z0-9]|\.(?!\.))*[a-z0-9]@gmail\.com$")
GMAIL_MSG = ("Please use your own Gmail address (yourname@gmail.com). Other and company email addresses are not accepted. "
             "Gmail names are 6–30 letters, numbers or dots.")
COMMON_PASSWORDS = {
    "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
    "11111111", "iloveyou", "welcome1", "welcome123", "admin123", "letmein1", "abc12345", "abcd1234", "india123", "india@123", "test1234", "hyperplane",
    "hyperplane1", "hyperplane123", "trading123", "stocks123", "money123", "monkey123", "dragon123", "football1", "sunshine1", "master123", "login123",
}
PLACE_PUNCT = " .'’-"


class Invalid(ValueError):
    """a value refused, with the plain message for the person and the form field it belongs to"""
    def __init__(self, message, field=""):
        super().__init__(message)
        self.field = field


def _bad_chars(s):
    """control, format (zero-width / bidi), surrogate, private-use or unassigned characters — never wanted in a form value"""
    return any(unicodedata.category(c) in ("Cc", "Cf", "Cs", "Co", "Cn") for c in s)


def clean(value, field, maxlen, required=True, label=None):
    """strip, collapse inner spaces, NFC — or raise Invalid (wrong type, control characters, too long)"""
    label = label or field
    if value is None or not isinstance(value, str):
        value = "" if value is None else str(value)
    if _bad_chars(value):
        raise Invalid(f"Please remove special or hidden characters from {label}.", field)
    v = unicodedata.normalize("NFC", " ".join(value.split()))
    if required and not v:
        raise Invalid(f"Please enter your {label}.", field)
    if len(v) > maxlen:
        raise Invalid(f"{label[0].upper() + label[1:]} is too long (at most {maxlen} characters).", field)
    return v


def name_error(n):
    """a person's name: letters (any language), spaces and . ' - ; NO numbers, no symbols"""
    if len(n) < 2:
        return "Please enter your full name."
    if any(unicodedata.category(c) == "Nd" or c.isdigit() for c in n):
        return "Numbers are not allowed in the name — please use letters only."
    if not all(c.isalpha() or unicodedata.category(c).startswith("M") or c in PLACE_PUNCT for c in n):
        return "Please use letters only in the name (spaces, dots, apostrophes and hyphens are fine)."
    if not n[0].isalpha() or not (n[-1].isalpha() or unicodedata.category(n[-1]).startswith("M") or n[-1] == "."):
        return "The name must start and end with a letter."
    if re.search(r"[ .'’-]{2,}", n.replace(". ", " ")):
        return "Please check the name — it has repeated spaces or symbols."
    if sum(c.isalpha() for c in n) < 2 or any(len(w) > 30 for w in n.split()):
        return "Please enter your full name."
    return ""


def gmail_error(email):
    if not GMAIL_RE.match(email or ""):
        return GMAIL_MSG
    return ""


def canonical_gmail(email):
    """Gmail ignores dots: rohit.k@gmail.com and rohitk@gmail.com are the same inbox — one account for both"""
    local, _, domain = (email or "").lower().partition("@")
    return local.replace(".", "") + "@" + domain


def place_error(v, label, required=True):
    if not v:
        return f"Please enter your {label}." if required else ""
    if any(c.isdigit() for c in v) or not all(c.isalpha() or unicodedata.category(c).startswith("M") or c in PLACE_PUNCT for c in v):
        return f"Please use letters only for your {label}."
    if len(v) < 2 and required:
        return f"Please enter your {label}."
    if re.search(r"[ .'’-]{2,}", v.replace(". ", " ")) or not v[0].isalpha() or not (v[-1].isalpha() or unicodedata.category(v[-1]).startswith("M") or v[-1] == "."):
        return f"Please check your {label} — use letters, with single spaces or hyphens between words."
    return ""


def password_error(pw, email="", name=""):
    if not isinstance(pw, str) or not 8 <= len(pw) <= 128:
        return "Password must be 8 to 128 characters."
    if _bad_chars(pw):
        return "Password has a character that is not allowed."
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        return "Password needs at least one letter and one number."
    low = pw.lower()
    if low in COMMON_PASSWORDS or len(set(low)) <= 2 or _sequential(re.sub(r"\D", "", low)) and len(re.sub(r"\D", "", low)) >= len(low) - 2:
        return "That password is too easy to guess — please choose another."
    local = (email or "").lower().split("@")[0].replace(".", "")
    if local and len(local) >= 4 and (low == local or local in low and len(low) - len(local) <= 2):
        return "Your password must not be your email name."
    first = (name or "").lower().split()[0] if (name or "").split() else ""
    if first and len(first) >= 4 and low.startswith(first) and len(low) - len(first) <= 3:
        return "Your password must not be your name."
    return ""


def validate_signup(d, countries, in_states):
    """the whole sign-up form → cleaned values, or Invalid(message, field). d: dict of the raw fields."""
    name = clean(d.get("name"), "name", 60, label="full name")
    if (e := name_error(name)):
        raise Invalid(e, "name")
    email = clean(d.get("email"), "email", 254, label="email address").lower()
    if (e := gmail_error(email)):
        raise Invalid(e, "email")
    phone = clean(d.get("phone"), "phone", 20, label="WhatsApp number")
    country = clean(d.get("country"), "country", 60, label="country")
    if country not in countries:
        raise Invalid("Please choose your country from the list.", "country")
    state = clean(d.get("state"), "state", 60, label="state")
    if country == "India":
        if state not in in_states:
            raise Invalid("Please choose your state from the list.", "state")
    elif (e := place_error(state, "state")):
        raise Invalid(e, "state")
    city = clean(d.get("city"), "city", 60, required=False, label="city")
    if (e := place_error(city, "city", required=False)):
        raise Invalid(e, "city")
    password = d.get("password")
    if (e := password_error(password, email, name)):
        raise Invalid(e, "password")
    return {"name": name, "email": email, "phone": phone, "country": country, "state": state, "city": city, "password": password}
