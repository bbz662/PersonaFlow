import os
import unittest
from unittest.mock import patch

from app.core.config import get_settings


class SettingsTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()

    def test_firestore_settings_default_when_env_missing(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()
            settings = get_settings()

        self.assertIsNone(settings.google_cloud_project)
        self.assertEqual(settings.firestore_database_id, "(default)")
        self.assertTrue(settings.realtime_voice_enabled)
        self.assertIsNone(settings.gemini_live_api_key)
        self.assertIsNone(settings.gemini_live_model)

    def test_firestore_settings_read_from_env(self) -> None:
        with patch.dict(
            os.environ,
            {
                "GOOGLE_CLOUD_PROJECT": "persona-flow-dev",
                "FIRESTORE_DATABASE_ID": "persona-db",
                "REALTIME_VOICE_ENABLED": "false",
                "GEMINI_LIVE_API_KEY": "live-secret",
                "GEMINI_LIVE_MODEL": "gemini-live-preview",
            },
            clear=True,
        ):
            get_settings.cache_clear()
            settings = get_settings()

        self.assertEqual(settings.google_cloud_project, "persona-flow-dev")
        self.assertEqual(settings.firestore_database_id, "persona-db")
        self.assertFalse(settings.realtime_voice_enabled)
        self.assertEqual(settings.gemini_live_api_key, "live-secret")
        self.assertEqual(settings.gemini_live_model, "gemini-live-preview")
