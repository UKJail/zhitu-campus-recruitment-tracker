#!/bin/sh
set -eu
# One deadline covers conversion AND PDF parsing, independently of the caller.
# Exit 124/137 is mapped to RENDER_TIMEOUT by the website. Nothing untrusted is
# interpolated into this command; document and output paths remain fixed.
exec /usr/bin/timeout --signal=TERM --kill-after=2s 40s /usr/local/bin/zhitu-render-job
