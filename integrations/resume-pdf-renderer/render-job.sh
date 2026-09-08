#!/bin/sh
set -eu
umask 077

test "$(id -u)" -ne 0
test -r /input/resume.docx
mkdir -p /work/profile
printf '%s' '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>' > /work/profile/registrymodifications.xcu
/usr/bin/libreoffice \
  -env:UserInstallation=file:///work/profile \
  --headless --nologo --nodefault --norestore --nolockcheck \
  --convert-to pdf:writer_pdf_Export --outdir /work /input/resume.docx >/dev/null 2>&1
test -s /work/resume.pdf

# A bounded JSON inspection line precedes the original PDF bytes. Poppler and
# Python run INSIDE the same network-disabled, memory-limited container; neither
# receives website credentials, uploaded command strings, or writable host paths.
/usr/bin/python3 -I /usr/local/bin/zhitu-inspect-pdf
exec /usr/bin/cat /work/resume.pdf
