"""backend that verifies BrowserID assertion.

Very similar backend is defined in django_browserid application. It is
not used here, because it does not allow to distinguish between an
assertion verification error and an unknown user.
"""
from django.contrib.auth.backends import ModelBackend
from django_browserid.base import verify
from wwwhisper_auth import models

class AssertionVerificationException(Exception):
    pass;

class BrowserIDBackend(ModelBackend):
    users_collection = models.UsersCollection();

    def authenticate(self, assertion):
        result = verify(assertion=assertion, audience=models.SITE_URL)
        if result is None:
            raise AssertionVerificationException(
                'BrowserID assertion verification failed.')
        return self.users_collection.find_item_by_email(result['email'])
