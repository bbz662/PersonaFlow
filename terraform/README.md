# Terraform Validation Scaffold

This directory contains a minimal Terraform scaffold for the PersonaFlow Google Cloud validation environment.

It is intentionally flat and limited to MVP validation infrastructure:

- required Google APIs
- Firestore in Native mode
- Artifact Registry for later manual image push and deployment

## Prerequisites

- Terraform 1.6 or newer
- Google Cloud project with billing enabled
- authenticated `gcloud` or Application Default Credentials with permission to enable APIs and manage Firestore and Artifact Registry

## Configure variables

1. Copy the example file:

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Fill in the values for your project:

   - `project_id`: target Google Cloud project ID
   - `region`: Artifact Registry region
   - `firestore_location`: Firestore location, which can differ from the Artifact Registry region
   - `firestore_database_id`: use `(default)` for the initial Firestore database in most MVP setups
   - `artifact_registry_repository_id`: repository name for backend images

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

Destroy the validation infrastructure when no longer needed:

```bash
terraform destroy
```

## Notes

- This scaffold does not define Cloud Run, CI/CD, frontend infrastructure, or complex IAM.
- `google_project_service` keeps APIs enabled on destroy with `disable_on_destroy = false` to avoid accidental shared-project disruption.
- Firestore creation can only succeed if the target database does not already exist. If a Firestore database was created manually, import it into Terraform state instead of creating a second one.
