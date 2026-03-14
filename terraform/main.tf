locals {
  required_services = [
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "run.googleapis.com",
  ]

  backend_image = "${google_artifact_registry_repository.backend.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.repository_id}/${var.backend_image_name}:${var.backend_image_tag}"
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

resource "google_cloud_run_v2_service" "backend" {
  name                = var.backend_service_name
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = var.backend_min_instance_count
      max_instance_count = var.backend_max_instance_count
    }

    containers {
      image = local.backend_image

      ports {
        container_port = 8080
      }

      env {
        name  = "APP_ENV"
        value = var.backend_app_env
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }

      env {
        name  = "GEMINI_API_KEY"
        value = var.backend_gemini_api_key
      }

      env {
        name  = "GEMINI_MODEL"
        value = var.backend_gemini_model
      }

      resources {
        startup_cpu_boost = true
        # cpu_idle = true
      }
    }

    timeout = "900s"
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.backend,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "backend_public_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
