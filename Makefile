SHELL := /bin/zsh

AGENT_PORT ?= 3001
NGROK_DOMAIN ?= mkimbell.ngrok.dev
PNPM_NEXT := corepack pnpm@10.33.4
PNPM_AGENT := corepack pnpm@11.25.0

.PHONY: dev web agent livekit backend ngrok install twilio-dev

# Starts the local site, the ConversationRelay agent, and the reserved ngrok
# endpoint together. overrides the ignored local env file only for
# these child processes, keeping manual production tests deliberate.
dev:
	@set -e; \
	$(PNPM_NEXT) --dir nextjs dev & web_pid=$$!; \
	$(PNPM_AGENT) --dir agent dev & agent_pid=$$!; \
	ngrok http --domain=$(NGROK_DOMAIN) $(AGENT_PORT) & ngrok_pid=$$!; \
	cleanup() { kill $$web_pid $$agent_pid $$ngrok_pid 2>/dev/null || true; }; \
	trap cleanup EXIT INT TERM; \
	wait $$web_pid $$agent_pid $$ngrok_pid

web:
	$(PNPM_NEXT) --dir nextjs dev

agent:
	$(PNPM_AGENT) --dir agent dev

livekit:
	@set -e; \
	$(PNPM_AGENT) --dir agent livekit:dev & smokey_pid=$$!; \
	$(PNPM_AGENT) --dir agent livekit:maple & maple_pid=$$!; \
	$(PNPM_AGENT) --dir agent livekit:coordinator & coordinator_pid=$$!; \
	cleanup() { kill $$smokey_pid $$maple_pid $$coordinator_pid 2>/dev/null || true; }; \
	trap cleanup EXIT INT TERM; \
	wait $$smokey_pid $$maple_pid $$coordinator_pid

# Every backend piece the bears need, without the website:
#   Twilio side  - the ConversationRelay agent (phone calls) + the ngrok tunnel
#                  Twilio reaches it through
#   LiveKit side - the Smokey, Maple and coordinator workers (talk / type on the site)
# Ctrl-C stops them all.
backend:
	@set -e; \
	$(PNPM_AGENT) --dir agent dev & agent_pid=$$!; \
	ngrok http --domain=$(NGROK_DOMAIN) $(AGENT_PORT) & ngrok_pid=$$!; \
	$(PNPM_AGENT) --dir agent livekit:dev & smokey_pid=$$!; \
	$(PNPM_AGENT) --dir agent livekit:maple & maple_pid=$$!; \
	$(PNPM_AGENT) --dir agent livekit:coordinator & coordinator_pid=$$!; \
	cleanup() { kill $$agent_pid $$ngrok_pid $$smokey_pid $$maple_pid $$coordinator_pid 2>/dev/null || true; }; \
	trap cleanup EXIT INT TERM; \
	wait $$agent_pid $$ngrok_pid $$smokey_pid $$maple_pid $$coordinator_pid

ngrok:
	ngrok http --domain=$(NGROK_DOMAIN) $(AGENT_PORT)

install:
	$(PNPM_NEXT) --dir nextjs install
	$(PNPM_AGENT) --dir agent install

twilio-dev:
	APP_ENV=DEV $(PNPM_NEXT) --dir nextjs twilio:setup
