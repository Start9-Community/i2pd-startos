FROM alpine:edge@sha256:9a341ff2287c54b86425cbee0141114d811ae69d88a36019087be6d896cef241

ARG I2PD_VERSION=2.60.0-r1

RUN apk add --no-cache \
    i2pd=${I2PD_VERSION} && \
    mkdir -p /var/lib/i2pd && \
    ln -s /usr/share/i2pd/certificates /var/lib/i2pd/certificates && \
    chown -R i2pd:i2pd /var/lib/i2pd

USER i2pd
ENTRYPOINT ["i2pd", "--conf=/var/lib/i2pd/i2pd.conf", "--datadir=/var/lib/i2pd"]
