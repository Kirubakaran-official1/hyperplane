#!/bin/sh
# Nightly database dump at 02:30 IST into ./backups, keeping the last KEEP_DAYS days.
KEEP_DAYS=${KEEP_DAYS:-14}
echo "backup service ready — dumps at 02:30 every night, keeping $KEEP_DAYS days"
num() { echo "$1" | sed 's/^0*//;s/^$/0/'; }          # "08" -> 8 (sh would read 08 as octal)
while true; do
  h=$(num "$(date +%H)"); m=$(num "$(date +%M)"); s=$(num "$(date +%S)")
  wait=$(( (2*3600 + 30*60 - (h*3600 + m*60 + s) + 86400) % 86400 ))
  [ "$wait" -eq 0 ] && wait=86400
  sleep "$wait"
  f="/backups/hyperplane_$(date +%Y%m%d_%H%M).dump"
  if pg_dump -h db -U hyperplane -d hyperplane -Fc -f "$f"; then
    echo "$(date) backup written: $f"
  else
    echo "$(date) backup FAILED"
  fi
  find /backups -name 'hyperplane_*.dump' -mtime +"$KEEP_DAYS" -delete
  sleep 60
done
