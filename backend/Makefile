-include .env.make

SHELL := /bin/bash

# =========
# User-configurable variables
# =========
PROJECT_ID       ?= your-gcp-project-id
REGION           ?= asia-northeast1
REPOSITORY       ?= your-artifact-registry-repo
IMAGE_NAME       ?= personaflow
TAG              ?= latest
SERVICE_NAME     ?= personaflow
DOCKERFILE       ?= Dockerfile
BUILD_CONTEXT    ?= .

# Optional: Cloud Run deploy settings
PLATFORM         ?= managed
ALLOW_UNAUTH     ?= --allow-unauthenticated
PORT             ?= 8080

# =========
# Derived variables
# =========
REGISTRY_HOST    := $(REGION)-docker.pkg.dev
IMAGE_URI        := $(REGISTRY_HOST)/$(PROJECT_ID)/$(REPOSITORY)/$(IMAGE_NAME):$(TAG)

# =========
# Helpers
# =========
.PHONY: help print-vars check-vars docker-auth build tag push build-push run-local \
        deploy logs describe clean

help:
	@echo "Available targets:"
	@echo "  make print-vars      - Print resolved build/deploy variables"
	@echo "  make check-vars      - Validate required variables"
	@echo "  make docker-auth     - Configure docker auth for Artifact Registry"
	@echo "  make build           - Build docker image locally"
	@echo "  make push            - Push image to Artifact Registry"
	@echo "  make build-push      - Build and push image"
	@echo "  make run-local       - Run image locally on port 8080"
	@echo "  make deploy          - Deploy image to Cloud Run"
	@echo "  make logs            - Read recent Cloud Run logs"
	@echo "  make describe        - Describe Cloud Run service"
	@echo "  make clean           - Remove local image"
	@echo ""
	@echo "Example:"
	@echo "  make build-push PROJECT_ID=my-project REPOSITORY=my-repo IMAGE_NAME=personaflow TAG=latest"
	@echo "  make deploy PROJECT_ID=my-project REPOSITORY=my-repo IMAGE_NAME=personaflow TAG=latest SERVICE_NAME=personaflow"

print-vars:
	@echo "PROJECT_ID    = $(PROJECT_ID)"
	@echo "REGION        = $(REGION)"
	@echo "REPOSITORY    = $(REPOSITORY)"
	@echo "IMAGE_NAME    = $(IMAGE_NAME)"
	@echo "TAG           = $(TAG)"
	@echo "SERVICE_NAME  = $(SERVICE_NAME)"
	@echo "DOCKERFILE    = $(DOCKERFILE)"
	@echo "BUILD_CONTEXT = $(BUILD_CONTEXT)"
	@echo "IMAGE_URI     = $(IMAGE_URI)"

check-vars:
	@test -n "$(PROJECT_ID)"    || (echo "PROJECT_ID is required" && exit 1)
	@test -n "$(REGION)"        || (echo "REGION is required" && exit 1)
	@test -n "$(REPOSITORY)"    || (echo "REPOSITORY is required" && exit 1)
	@test -n "$(IMAGE_NAME)"    || (echo "IMAGE_NAME is required" && exit 1)
	@test -n "$(TAG)"           || (echo "TAG is required" && exit 1)
	@test -f "$(DOCKERFILE)"    || (echo "Dockerfile not found: $(DOCKERFILE)" && exit 1)

docker-auth: check-vars
	gcloud auth configure-docker $(REGISTRY_HOST)

build: check-vars
	docker build \
		-f $(DOCKERFILE) \
		-t $(IMAGE_URI) \
		$(BUILD_CONTEXT)

docker-login: check-vars
	gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://$(REGISTRY_HOST)

push: check-vars
	docker push $(IMAGE_URI)

build-push: build docker-login push

run-local: check-vars
	docker run --rm -p $(PORT):$(PORT) \
		-e PORT=$(PORT) \
		$(IMAGE_URI)

deploy: check-vars
	gcloud run deploy $(SERVICE_NAME) \
		--image $(IMAGE_URI) \
		--project $(PROJECT_ID) \
		--region $(REGION) \
		--platform $(PLATFORM) \
		--port $(PORT) \
		$(ALLOW_UNAUTH)

logs:
	gcloud run services logs read $(SERVICE_NAME) \
		--project $(PROJECT_ID) \
		--region $(REGION) \
		--limit=200

describe:
	gcloud run services describe $(SERVICE_NAME) \
		--project $(PROJECT_ID) \
		--region $(REGION)

clean:
	-docker rmi $(IMAGE_URI)
