VERSION := $(shell jq -r .version < package.json)

all: node_modules hemtjanst-adapter-${VERSION}.tgz

depclean: clean
	rm -rf node_modules || true

clean:
	rm hemtjanst-adapter-*.tgz || true

node_modules:
	npm install

hemtjanst-adapter-${VERSION}.tgz:
	sh -c 'sha256sum *.js package.json LICENSE > SHA256SUMS'
	tar --transform 's/^/package\//' -zcf hemtjanst-adapter-${VERSION}.tgz *.js node_modules package.json LICENSE SHA256SUMS
