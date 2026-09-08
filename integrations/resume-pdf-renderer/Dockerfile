# Deliberately no mutable default. Deployment supplies a reviewed Debian base
# pinned by digest, and configures the resulting image by digest or image ID.
ARG RENDERER_BASE_IMAGE
FROM ${RENDERER_BASE_IMAGE}

# The optional Alibaba VPC mirror changes transport only. Keep the image's
# Debian archive keyring, Signed-By declarations and all APT signature checks.
# Never accept an arbitrary build-time repository or trusted=yes override.
ARG DEBIAN_MIRROR=official
RUN case "$DEBIAN_MIRROR" in \
      official) ;; \
      aliyun-vpc) sed -i 's|http://deb.debian.org/|http://mirrors.cloud.aliyuncs.com/|g' /etc/apt/sources.list.d/debian.sources ;; \
      *) exit 1 ;; \
    esac \
    && apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=60 update \
    && apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=60 install --no-install-recommends -y libreoffice-writer coreutils poppler-utils python3-minimal fonts-noto-cjk fonts-dejavu-core fonts-liberation \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && test -x /usr/bin/libreoffice \
    && test -x /usr/bin/timeout \
    && test -x /usr/bin/pdfinfo \
    && test -x /usr/bin/pdftotext \
    && /usr/bin/python3 -I -c "import json, os, re, subprocess, sys"

# Plain COPY plus fixed-path chmod works with Docker 26's legacy builder too.
# Do not require BuildKit-only COPY flags just to set executable permissions.
COPY render.sh /usr/local/bin/zhitu-render
COPY render-job.sh /usr/local/bin/zhitu-render-job
COPY inspect-pdf.py /usr/local/bin/zhitu-inspect-pdf
RUN sed -i 's/\r$//' /usr/local/bin/zhitu-render /usr/local/bin/zhitu-render-job /usr/local/bin/zhitu-inspect-pdf \
    && chmod 0555 /usr/local/bin/zhitu-render /usr/local/bin/zhitu-render-job /usr/local/bin/zhitu-inspect-pdf \
    && /bin/sh -n /usr/local/bin/zhitu-render \
    && /bin/sh -n /usr/local/bin/zhitu-render-job \
    && /usr/bin/python3 -I -c "compile(open('/usr/local/bin/zhitu-inspect-pdf', encoding='utf-8').read(), 'zhitu-inspect-pdf', 'exec')" \
    && mkdir -p /work \
    && chmod 0755 /work
# /work itself is not writable by this identity. The admitted runtime mounts a
# private uid/gid-owned 0700 tmpfs over it; never make the image directory 0777.
USER 10001:10001
WORKDIR /work
ENV HOME=/work/profile TMPDIR=/tmp LANG=C.UTF-8 SAL_USE_VCLPLUGIN=svp
ENTRYPOINT ["/usr/local/bin/zhitu-render"]
