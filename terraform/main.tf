locals {
  required_services = [
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
  ]
}

resource "google_project_service" "required" {
  for_each = toset(local.required_services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firestore_database" "default" {
  provider = google-beta

  project     = var.project_id
  name        = var.firestore_database_id
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository" "backend" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repository_id
  format        = var.artifact_registry_format
  description   = "MVP validation repository for PersonaFlow backend images."

  depends_on = [google_project_service.required]
}
