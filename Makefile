SHELL := /bin/zsh

AGENT_PORT ?= 3001
NGROK_DOMAIN ?= mkimbell.ngrok.dev
PNPM_NEXT := corepack pnpm@10.33.4
PNPM_AGENT := corepack pnpm@11.25.0

.PHONY: dev web agent ngrok install twilio-dev

# Starts the local site, the ConversationRelay agent, and the reserved ngrok
# endpoint together. APP_ENV=DEV overrides the ignored local env file only for
# these child processes, keeping manual production tests deliberate.
dev:
	@set -e; \
	APP_ENV=DEV $(PNPM_NEXT) --dir nextjs dev & web_pid=$$!; \
	APP_ENV=DEV $(PNPM_AGENT) --dir agent dev & agent_pid=$$!; \
	ngrok http --domain=$(NGROK_DOMAIN) $(AGENT_PORT) & ngrok_pid=$$!; \
	cleanup() { kill $$web_pid $$agent_pid $$ngrok_pid 2>/dev/null || true; }; \
	trap cleanup EXIT INT TERM; \
	wait $$web_pid $$agent_pid $$ngrok_pid

web:
	APP_ENV=DEV $(PNPM_NEXT) --dir nextjs dev

agent:
	APP_ENV=DEV $(PNPM_AGENT) --dir agent dev

ngrok:
	ngrok http --domain=$(NGROK_DOMAIN) $(AGENT_PORT)

install:
	$(PNPM_NEXT) --dir nextjs install
	$(PNPM_AGENT) --dir agent install

twilio-dev:
	APP_ENV=DEV $(PNPM_NEXT) --dir nextjs twilio:setup
