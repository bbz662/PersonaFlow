# Terraform Validation Scaffold

This directory contains a minimal Terraform scaffold for the PersonaFlow Google Cloud validation environment.

It is intentionally flat and limited to MVP validation infrastructure:

- required Google APIs
- Firestore in Native mode
- Artifact Registry for later manual image push and deployment
- Cloud Run backend service wired to an Artifact Registry image

## Prerequisites

- Terraform 1.6 or newer
- Google Cloud project with billing enabled
- authenticated `gcloud` or Application Default Credentials with permission to enable APIs and manage Firestore, Artifact Registry, and Cloud Run

## Configure variables

1. Copy the example file:

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Fill in the values for your project:

   - `project_id`: target Google Cloud project ID
   - `region`: regional location for Artifact Registry and Cloud Run
   - `firestore_location`: Firestore location, which can differ from the Artifact Registry region
   - `firestore_database_id`: use `(default)` for the initial Firestore database in most MVP setups
   - `artifact_registry_repository_id`: repository name for backend images
   - `backend_service_name`: Cloud Run service name for the backend
   - `backend_image_name`: image name to push into the Artifact Registry repository
   - `backend_image_tag`: image tag that Cloud Run should deploy, such as `latest`
   - `backend_app_env`: backend `APP_ENV` value, typically `production`
   - `backend_gemini_api_key`: placeholder API key value for MVP validation
   - `backend_gemini_model`: backend `GEMINI_MODEL` value

## Usage

Run commands from this `terraform/` directory.

Initialize providers:

```bash
terraform init
```

Preview changes:

```bash
terraform plan
```

Apply the validation infrastructure:

```bash
terraform apply
```

Build, tag, and push the backend image manually from local development:

```bash
docker build -t personaflow-backend-test ./backend
docker tag personaflow-backend-test REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY_ID/IMAGE_NAME:IMAGE_TAG
docker push REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY_ID/IMAGE_NAME:IMAGE_TAG
```

If you push a new image to the same mutable tag, run `terraform apply` again to roll Cloud Run forward using the configured image reference.

Destroy the validation infrastructure when no longer needed:

```bash
terraform destroy
```

## Notes

- This scaffold does not define CI/CD, frontend infrastructure, or complex IAM.
- `google_project_service` keeps APIs enabled on destroy with `disable_on_destroy = false` to avoid accidental shared-project disruption.
- Firestore creation can only succeed if the target database does not already exist. If a Firestore database was created manually, import it into Terraform state instead of creating a second one.
- The backend service is configured for unauthenticated access with a minimal `allUsers` invoker binding so the MVP can be validated quickly.
- `backend_gemini_api_key` is a plain Terraform variable for now. That is intentional for MVP validation, but it should move to Secret Manager or another managed secret flow in a follow-up issue.
