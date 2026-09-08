# Deliberately no mutable default. Deployment supplies a reviewed Debian base
# pinned by digest, and configures the resulting image by digest or image ID.
ARG RENDERER_BASE_IMAGE
FROM ${RENDERER_BASE_IMAGE}

RUN apt-get update \
    && apt-get install --no-install-recommends -y libreoffice-writer coreutils poppler-utils python3-minimal fonts-noto-cjk fonts-dejavu-core fonts-liberation \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && test -x /usr/bin/libreoffice \
    && test -x /usr/bin/timeout

COPY --chmod=0555 render.sh /usr/local/bin/zhitu-render
COPY --chmod=0555 render-job.sh /usr/local/bin/zhitu-render-job
COPY --chmod=0555 inspect-pdf.py /usr/local/bin/zhitu-inspect-pdf
USER 10001:10001
WORKDIR /work
ENV HOME=/work/profile TMPDIR=/tmp LANG=C.UTF-8 SAL_USE_VCLPLUGIN=svp
ENTRYPOINT ["/usr/local/bin/zhitu-render"]
