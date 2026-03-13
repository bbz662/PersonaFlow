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

variable "backend_service_name" {
  description = "Cloud Run service name for the PersonaFlow backend."
  type        = string
  default     = "personaflow-backend"
}

variable "backend_image_name" {
  description = "Container image name inside the Artifact Registry repository."
  type        = string
  default     = "backend"
}

variable "backend_image_tag" {
  description = "Container image tag to deploy for MVP validation. A mutable tag such as latest is acceptable."
  type        = string
  default     = "latest"
}

variable "backend_app_env" {
  description = "APP_ENV value passed to the backend container."
  type        = string
  default     = "production"
}

variable "backend_gemini_api_key" {
  description = "GEMINI_API_KEY value passed to Cloud Run for MVP validation."
  type        = string
  default     = ""
  sensitive   = true
}

variable "backend_gemini_model" {
  description = "GEMINI_MODEL value passed to the backend container."
  type        = string
  default     = "gemini-2.0-flash"
}
