"""Utils to simplify writing of REST style views.

Contains classes representing commonly used HTTP response codes
(similarly to HttpResponseNotFound already available in Django).
"""

from django.conf import settings
from django.http import HttpResponse
from django.middleware import csrf
from django.utils.crypto import constant_time_compare
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.generic import View
from wwwhisper_auth import models

import json
import logging
import traceback

logger = logging.getLogger(__name__)


class HttpResponseJson(HttpResponse):
    """"Request succeeded.

    Response contains json representation of a resource.
    """

    def __init__(self, attributes_dict):
        super(HttpResponseJson, self).__init__(json.dumps(attributes_dict),
                                               mimetype="application/json",
                                               status=200)

class HttpResponseNoContent(HttpResponse):
    """Request succeeded but response body is empty."""

    def __init__(self):
        super(HttpResponseNoContent, self).__init__(status=204)

class HttpResponseCreated(HttpResponse):
    """Response returned when resource was created.

    Contains json representation of the created resource.
    """

    def __init__(self, attributes_dict):
        """
        Args:
            attributes_dict: A dictionary containing all attributes of
                the created resource. The attributes are serialized to
                json and returned in the response body
        """

        super(HttpResponseCreated, self).__init__(json.dumps(attributes_dict),
                                                  mimetype="application/json",
                                                  status=201)


class HttpResponseBadRequest(HttpResponse):
    """Response returned when request was invalid."""

    def __init__(self, message):
        logger.debug('Bad request %s' % (message))
        super(HttpResponseBadRequest, self).__init__(message, status=400)

class RestView(View):
    """A common base class for all REST style views.

    Disallows all cross origin requests. Disables caching of
    responses. For POST and PUT methods, deserializes method arguments
    from a json encoded request body. If a specific method is not
    implemented in a subclass, or if it does not accept arguments
    passed in the body, or if some arguments are missing, an
    appropriate error is returned to the client.
    """

    @method_decorator(never_cache)
    def dispatch(self, request, *args, **kwargs):
        """Dispatches a method to a subclass.

        kwargs contains arguments that are passed as a query string,
        for PUT and POST arguments passed in a json request body are
        added to kwargs, conflicting names result in an error.
        """

        # Cross-Origin Resource Sharing allows cross origin Ajax GET
        # requests, each such request must have the 'Origin' header
        # set. Drop such requests.
        if request.META.has_key('HTTP_ORIGIN'):
            origin = request.META['HTTP_ORIGIN']
            if origin != models.SITE_URL:
                return HttpResponseBadRequest(
                    'Cross origin requests not allowed.')

        # Disable CSRF protection in test environment.
        if not getattr(request, '_dont_enforce_csrf_checks', False):
            # Django CSRF protection middleware is not used directly
            # because it allows cross origin GET requests and does
            # strict referer checking for HTTPS requests.
            #
            # GET request are believed to be safe because they do not
            # modify state, but they do require special care to make
            # sure the result is not leaked to the calling site. Under
            # some circumstances resulting json, when interpreted as
            # script or css, can possibly be leaked. The simplest
            # protection is to disallow cross origin GETs.
            #
            # Strict referer checking for HTTPS requests is a
            # protection method recommended by a study 'Robust Defenses
            # for Cross-Site Request Forgery'. According to the study,
            # only 0.2% of users block the referer header for HTTPS
            # traffic. Many think the number is low enough not to
            # support these users. Unfortunately, the methodology used
            # in the study had a considerable flaw, and the actual
            # number may be much higher.
            #
            # Because all protected methods are called with Ajax, for
            # most clients a check that ensures a custom header is set
            # is sufficient CSRF protection. No token is needed,
            # because browsers disallow setting custom headers for
            # cross origin requests. Unfortunately, legacy versions of
            # some plugins did allow such headers, to protect users of
            # these plugins a token needs to be used. The problem that
            # is left is a protection of a user that is using a legacy
            # plugin in a presence of an active network attacker. Such
            # attacker can inject his token over HTTP, the token will
            # then be used over HTTPS. The impact is mitigated if
            # Strict Transport Security header is set (as recommended)
            # for all wwwhisper protected sites (not perfect solution,
            # because the header is supported only by the newest
            # browsers).
            header_token = request.META.get('HTTP_X_CSRFTOKEN', '')
            cookie_token = request.COOKIES.get(settings.CSRF_COOKIE_NAME, '')
            if (len(header_token) != csrf.CSRF_KEY_LENGTH or
                not constant_time_compare(header_token, cookie_token)):
                return HttpResponseBadRequest(
                    'CSRF token missing or incorrect.')

        method = request.method.lower()
        # Parse body as json object if it is not empty (empty body
        # contains '--BoUnDaRyStRiNg--')
        # TODO: make sure mime type is set to json.
        if (method == 'post' or method == 'put') \
                and len(request.body) != 0 and request.body[0] != '-':
            try:
                json_args = json.loads(request.body)
                for k in json_args:
                    if kwargs.has_key(k):
                        return HttpResponseBadRequest(
                            'Invalid argument passed in the request body.')
                    else:
                        kwargs[k] = json_args[k]
                kwargs.update()
            except ValueError as err:
                logger.debug(
                    'Failed to parse the request body a as json object: %s'
                    % (err))
                return HttpResponseBadRequest(
                    'Failed to parse the request body as a json object.')
        try:
            return super(RestView, self).dispatch(request, *args, **kwargs)
        except TypeError as err:
            trace = "".join(traceback.format_exc())
            logger.debug('Invalid arguments, handler not found: %s\n%s'
                         % (err, trace))
            return HttpResponseBadRequest('Invalid request arguments')