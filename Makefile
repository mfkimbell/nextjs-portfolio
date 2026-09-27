SHELL := /bin/zsh

AGENT_PORT ?= 3001
NGROK_DOMAIN ?= mkimbell.ngrok.dev

.PHONY: dev agent ngrok install

# Starts the ConversationRelay agent and exposes it at the reserved ngrok domain.
# Run `pnpm --dir nextjs dev` separately when developing the visual frontend.
dev:
	@trap 'kill 0' INT TERM EXIT; \
	pnpm --dir agent dev & \
	ngrok http --domain=$(NGROK_DOMAIN) $(AGENT_PORT)

agent:
	pnpm --dir agent dev

ngrok:
	ngrok http --domain=$(NGROK_DOMAIN) $(AGENT_PORT)

install:
	pnpm --dir nextjs install
	pnpm --dir agent install
