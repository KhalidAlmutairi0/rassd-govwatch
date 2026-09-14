#!/bin/sh
set -eu
# Cranl routes external port 3000 to nginx. The API must keep its own port.
unset PORT
node backend/scripts/database.mjs migrate
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/rasd.conf
