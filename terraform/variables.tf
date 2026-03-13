variable "project_id" {
  description = "Google Cloud project ID for the validation environment."
  type        = string
}

variable "region" {
  description = "Google Cloud region for regional resources such as Artifact Registry."
  type        = string
}

variable "firestore_location" {
  description = "Firestore database location. This can be a regional or multi-region location, for example us-central1 or nam5."
  type        = string
}

variable "firestore_database_id" {
  description = "Firestore database ID. Use (default) for the initial database in most MVP setups."
  type        = string
  default     = "(default)"
}

variable "artifact_registry_repository_id" {
  description = "Artifact Registry repository ID for backend container images."
  type        = string
  default     = "personaflow-validation"
}

variable "artifact_registry_format" {
  description = "Artifact Registry repository format."
  type        = string
  default     = "DOCKER"

  validation {
    condition     = contains(["DOCKER"], var.artifact_registry_format)
    error_message = "artifact_registry_format must be DOCKER for this scaffold."
  }
}
