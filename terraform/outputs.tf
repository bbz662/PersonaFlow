output "project_id" {
  description = "Google Cloud project ID used by this scaffold."
  value       = var.project_id
}

output "enabled_services" {
  description = "Google APIs enabled for the validation environment."
  value       = sort(keys(google_project_service.required))
}

output "firestore_database_name" {
  description = "Firestore database resource name."
  value       = google_firestore_database.default.name
}

output "firestore_database_location" {
  description = "Firestore database location."
  value       = google_firestore_database.default.location_id
}

output "artifact_registry_repository_name" {
  description = "Artifact Registry repository resource name."
  value       = google_artifact_registry_repository.backend.name
}

output "artifact_registry_repository_url" {
  description = "Artifact Registry repository URL prefix for manual image tagging and push."
  value       = "${google_artifact_registry_repository.backend.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.repository_id}"
}
