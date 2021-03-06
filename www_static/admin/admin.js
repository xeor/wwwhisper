/*!
 * wwwhisper - web access control.
 * Copyright (C) 2012-2017 Jan Wrobel
 */
/*jslint browser: true, white: true, indent: 2 */
/*global  $ */
/*global wwwhisper */
(function () {
  'use strict';

  /**
   * Utility functions.
   */
  var utils = {

    /**
     * Throws if condition is false.
     */
    assert: function(condition, message) {
      function AssertionError(message) {
        this.message = message;
        this.toString = function() {
          return 'AssertionError: ' + this.message;
        };
      }

      if (!condition) {
        throw new AssertionError(message);
      }
    },

    /**
     * Calls callback for each element of an iterable.
     */
    each: function(iterable, callback) {
      $.each(iterable, function(id, value) {
        callback(value);
      });
    },

    /**
     * Finds an element in an array that satisfies a given
     * filter. Returns null if no such element exists.
     *
     * Filtering condition must be satisfied by at most one element,
     * if multiple elements satisfy the filter, AssertionError is
     * thrown.
     */
    findOnly: function(array, filterCallback) {
      var result;
      result = $.grep(array, filterCallback);
      if (result.length === 0) {
        return null;
      }
      utils.assert(result.length === 1,
                   'Not unique result of findOnly function.');
      return result[0];
    },

    /**
     * Returns true if a value is in an array.
     */
    inArray: function(value, array) {
      return ($.inArray(value, array) >= 0);
    },

    /**
     * Removes a value from an array, has no effect if the value is not
     * in an array.
     */
    removeFromArray: function(value, array) {
      var idx = $.inArray(value, array);
      if (idx === -1) {
        return;
      }
      array.splice(idx, 1);
    },

    /**
     * Comparison function to be used in sorting algorithms. Returns
     * -1, 0 or 1.
     */
    compare: function(a, b) {
      if (a < b) {
        return -1;
      }
      if (a > b) {
        return 1;
      }
      return 0;
    },

    /**
     * Returns array sorted in order defined by a given comparator (or
     * alphabetical if comparator is not passed). Does not modify the
     * input array.
     */
    sort: function(array, comparator) {
      var arrayCopy = array.slice(0, array.length);
      arrayCopy.sort(comparator);
      return arrayCopy;
    },

    /**
     * Returns array of object sorted by a property which name (a
     * string) is passed as an argument. Sort order is ascending. Each
     * object in the input array needs to have a property on which
     * sorting is done. Does not modify the input array.
     */
    sortByProperty: function(array, propertyName) {
      return utils.sort(array, function(a, b) {
        return utils.compare(a[propertyName], b[propertyName]);
      });
    },

    /**
     * Extracts a given property from each item of the input array and
     * returns these properties in the result array. Each item in the
     * input array needs to have the extracted property.
     */
    extractProperty: function(array, propertyName) {
      return $.map(array, function(item) {
        return item[propertyName];
      });
    },

    /**
     * Returns true if stringB is a prefix of stringA.
     */
    startsWith: function(stringA, stringB) {
      return stringA.lastIndexOf(stringB, 0) === 0;
    },

    /**
     * Extracts uuid from urn
     * (e.g. urn2uuid('urn:uuid:6e8bc430-9c3a-11d9-9669-0800200c9a66')
     * === '6e8bc430-9c3a-11d9-9669-0800200c9a66').
     */
    urn2uuid: function(urn) {
      return urn.replace('urn:uuid:', '');
    },

    /**
     * Strips trailing /index.html or / from a given path. E.g:
     *   /foo/index.html -> /foo
     *   /foo/           -> /foo
     *   /foo            -> /foo
     */
    stripTrailingIndexHtmlAndSlash: function(path) {
      return path.replace(new RegExp('(/index.html$)|(/$)'), '');
    }
  };

  /**
   * Communicates with the server. Retrieves current access control
   * list and exposes operations to modify it (add/remove locations
   * and users, grant/revoke access to a location). Requests UI
   * updates when data to be displayed changes.
   */
  function Controller(ui, stub) {
    var that = this;

    this.aliases = [];
    this.locations = [];
    this.users = [];
    // Holds a wwwhisper login page configuration.
    this.skin = null;

    // An email of a currently signed in user that accesses the admin
    // application. This is kept to prevent the user from deleting a
    // permission that allows him to access the admin application.
    // Such operation is not illegal in itself and the back-end allows
    // it, but it is unlikely what the user would like to do (after
    // deleting the permission the admin application becomes unusable
    // for the user and only other admin user can fix it).
    this.adminUserEmail = null;
    // Path to the admin application
    this.adminPath = null;
    // Delegate errors to the UI.
    this.errorHandler = ui.handleError;

    /**
     * Returns true if a user can access a location.
     */
    this.canAccess = function(user, location) {
      return location.hasOwnProperty('openAccess') || utils.inArray(
        user.id, utils.extractProperty(location.allowedUsers, 'id'));
    };

    /**
     * Removes a user from an array of users that can access a given
     * location (this affect only a local representation of the
     * location object, nothing is sent to the server).
     */
    this.removeAllowedUser = function(user, location) {
      location.allowedUsers = $.grep(location.allowedUsers, function(u) {
        return u.id !== user.id;
      });
    };

    /**
     * Returns a user object with a given email or null.
     */
    this.findUserWithEmail = function(email) {
      return utils.findOnly(that.users, function(user) {
        return user.email === email;
      });
    };

    /**
     * Returns a location object with a given id or null.
     */
    this.findLocationWithId = function(id) {
      return utils.findOnly(that.locations, function(location) {
        return location.id === id;
      });
    };

    /**
     * Returns an array of locations that a given user can access.
     */
    this.accessibleLocations = function(user) {
      return $.grep(that.locations, function(location) {
        return that.canAccess(user, location);
      });
    };

    /**
     * Functions to retrieve arrays of users, locations and
     * aliases from the server. successCallback is invoked when
     * successfully done.
     */
    this.getUsers = function(successCallback) {
      stub.ajax('GET', 'api/users/', null, function(result) {
        that.users = result.users;
        successCallback();
      });
    };
    this.getLocations = function(successCallback) {
      stub.ajax('GET', 'api/locations/', null, function(result) {
        that.locations = result.locations;
        successCallback();
      });
    };
    this.getAliases = function(successCallback) {
      stub.ajax('GET', 'api/aliases/', null, function(result) {
        that.aliases = result.aliases;
        successCallback();
      });
    };
    this.getSkin = function(successCallback) {
      stub.ajax('GET', 'api/skin/', null, function(result) {
        that.skin = result;
        successCallback();
      });
    };

    /**
     * Retrieves an email of currently signed in user, invokes
     * successCallback when successfully done. Displays warning if no user
     * is sign in, which means the admin interface is likely
     * misconfigured (can be accessed without authentication).
     */
    this.getAdminUser = function(successCallback) {
      // Do not use the default error handler, display a more
      // meaningful error message.
      stub.ajax('GET', '/wwwhisper/auth/api/whoami/', null,
                function(result) {
                  that.adminUserEmail = result.email;
                  successCallback();
                },
                function(errorMessage, errorStatus, isTextPlain) {
                  if (errorStatus === 401) {
                    that.errorHandler(
                      'wwwhisper likely misconfigured: Admin application can ' +
                        'be accessed without authentication!');
                    successCallback();
                  } else {
                    that.errorHandler(errorMessage, errorStatus, isTextPlain);
                  }
                });
    };

    /**
     * Returns true if a path is handled by the admin application.
     */
    this.handledByAdmin = function(path) {
      return path === that.adminPath ||
        utils.startsWith(path, that.adminPath + '/');
    };

    /**
     * Executes all asynchronous tasks from the tasks array. Each task
     * is a function that needs to accept a single argument: a
     * callback to be asynchronously invoked on success. If all tasks
     * finish successfully, allDone callback is invoked.
     */
    this.asyncExecuteAll = function(tasks, allDone) {
      var succesful_cnt = 0;
      function done() {
        succesful_cnt += 1;
        if (succesful_cnt === tasks.length) {
          allDone();
        }
      }
      utils.each(tasks, function(task) {
        task(done);
      });
    };

    /**
     * Adds an alias (scheme://domain[:optional port]) that can be
     * used to access the site.
     */
    this.addAlias = function(urlArg) {
      stub.ajax('POST', 'api/aliases/', {url: urlArg},
                function(alias) {
                  that.aliases.push(alias);
                  ui.refresh();
                });
    };

    this.removeAlias = function(alias, failureHandler) {
      stub.ajax('DELETE', alias.self, null,
                function() {
                  utils.removeFromArray(alias, that.aliases);
                  ui.refresh();
                },
                failureHandler);
    };

    /**
     * Adds a location with a given path.
     *
     * Refuses to add sub location to the admin application (this is
     * just a client side check to prevent the user from shooting
     * himself in the foot).
     */
    this.addLocation = function(locationPathArg) {
      var locationPath = $.trim(locationPathArg);
      if (that.handledByAdmin(locationPath)) {
        that.errorHandler(
          'Adding sublocations to admin is not supported '+
            '(It could easily cut off access to the admin application).');
        return;
      }
      stub.ajax('POST', 'api/locations/', {path: locationPath},
                function(newLocation) {
                  that.locations.push(newLocation);
                  ui.refresh(newLocation);
                });
    };

    this.removeLocation = function(location, failureHandler) {
      stub.ajax('DELETE', location.self, null,
                function() {
                  utils.removeFromArray(location, that.locations);
                  ui.refresh();
                },
                failureHandler);
    };

    /**
     * Adds a user with a given email. Invokes a callback on success.
     */
    this.addUser = function(emailArg, successCallback) {
      stub.ajax('POST', 'api/users/', {email: emailArg},
                function(user) {
                  that.users.push(user);
                  successCallback(user);
                });
    };

    this.removeUser = function(user, failureHandler) {
      stub.ajax('DELETE', user.self, null,
                function() {
                  utils.each(that.locations, function(location) {
                    if (that.canAccess(user, location)) {
                      that.removeAllowedUser(user, location);
                    }
                  });
                  utils.removeFromArray(user, that.users);
                  ui.refresh();
                },
               failureHandler);
    };

    /**
     * Allows everyone access to a location.
     */
    this.grantOpenAccess = function(location) {
      stub.ajax(
        'PUT',
        location.self + 'open-access/',
        null,
        function(result) {
          location.openAccess = result;
          ui.refresh();
        }
      );
    };

    /**
     * Turns on normal access control for a location (only explicitly
     * listed users are granted access).
     */
    this.revokeOpenAccess = function(location) {
      if (!location.hasOwnProperty('openAccess')) {
        return;
      }
      stub.ajax(
        'DELETE',
        location.self + 'open-access/',
        null,
        function() {
          delete location.openAccess;
          ui.refresh();
        }
      );
    };

    /**
     * Grants a user with a given email access to a given location.
     *
     * Is user with such email does not exist, adds the user first.
     */
    this.grantAccess = function(email, location, failureHandler) {
      var cleanedEmail, user, grantPermissionCallback;
      cleanedEmail = $.trim(email);
      if (cleanedEmail.length === 0) {
        return;
      }

      user = that.findUserWithEmail(cleanedEmail);
      if (user !== null && that.canAccess(user, location)) {
        // User already can access the location.
        return;
      }

      grantPermissionCallback = function(userArg) {
        stub.ajax(
          'PUT',
          location.self + 'allowed-users/' + utils.urn2uuid(userArg.id) + '/',
          null,
          function() {
            // Do nothing if the user was granted access in the
            // meantime (this can happen for instance when grant
            // access is clicked twice).
            if (!that.canAccess(userArg, location)) {
              location.allowedUsers.push(userArg);
              ui.refresh();
            }
          },
          failureHandler
        );
      };

      if (user !== null) {
        grantPermissionCallback(user);
      } else {
        that.addUser(cleanedEmail, grantPermissionCallback);
      }
    };

    /**
     * Revokes access to a given location by a given user.
     */
    this.revokeAccess = function(user, location, failureHandler) {
      stub.ajax(
        'DELETE',
        location.self + 'allowed-users/' + utils.urn2uuid(user.id) + '/',
        null,
        function() {
          that.removeAllowedUser(user, location);
          ui.refresh();
        },
        failureHandler);
    };

    this.updateSkin = function(newSkin) {
      stub.ajax('PUT', 'api/skin/', newSkin,
                function(result) {
                  that.skin = result;
                  ui.refresh();
                });
    };

    /**
     * Activates the admin application (retrieves all dynamic data
     * from the server and refreshes the UI).
     */
    this.activate = function() {
      that.adminPath = utils.stripTrailingIndexHtmlAndSlash(
        window.location.pathname);
      stub.setErrorHandler(that.errorHandler);
      that.asyncExecuteAll([that.getLocations,
                            that.getUsers,
                            that.getAliases,
                            that.getSkin,
                            that.getAdminUser],
                           ui.refresh);
    };
  }

  /**
   * Handles user interface. Reacts to the user input and dispatches
   * appropriate access management operations to the Controller
   * object.
   */
  function UI() {

    // Cloned parts of a DOM tree, responsible for displaying and
    // manipulating access control list. The structure is defined in
    // the html file, this way js code does not need to create complex
    // DOM 'manually'.
    var view = {
      // A path to a location + controls to remove and visit a location.
      locationPath : $('#location-list-item').clone(true),
      // A list of users that can access a location (contains
      // view.allowedUser elements) + input box for adding a new user.
      locationInfo : $('#location-info-list-item').clone(true)
        .find('.add-allowed-user').val('').end(), //Clears any stored input.
      // A single user that is allowed to access a location + control
      // to revoke access.
      allowedUser : $('#allowed-user-list-item').clone(true),
      // An input box for adding a new location.
      addLocation : $('#add-location').clone(true)
        .find('#add-location-input').val('').end(),
      // User that is on contact list (was granted access to some
      // location at some point) + controls to remove the user (along
      // with access to all locations), check which locations a user
      // can access, notify a user and grant access to currently
      // active location.
      user : $('.user-list-item').clone(true),
      alias : $('.alias-list-item').clone(true),
      // Box for displaying error messages.
      errorMessage : $('.alert-error').first().clone(true)
    },
    that = this,
    controller = null,
    loading = true,
    ENTER_KEY = 13,
    // These would preferably be obtained dynamically, but css floats
    // make it hard to get elements' max-width.
    MAX_PATH_WIDTH_PX = 275,
    MAX_EMAIL_WIDTH_PX = MAX_PATH_WIDTH_PX - 5,
    MAX_ALIAS_WIDTH_PX = 390;

    /**
     * scheme://domain[:port if not default] of the current document.
     */
    function currentUrlRoot() {
      return location.protocol + '//' + location.host;
    }

    /**
     * Annotates currently signed in user to make it clearer that this
     * user is treated a little specially (can not be removed, can not
     * be revoked access to the admin location).
     */
    function userAnnotation(user) {
      if (user.email === controller.adminUserEmail) {
        return ' (you)';
      }
      return '';
    }

    /**
     * Annotates a current url on the list of aliases.
     */
    function aliasAnnotation(alias) {
      if (alias.url === currentUrlRoot()) {
        return ' (current)';
      }
      return '';
    }

    function focusedElement() {
      return $(document.activeElement);
    }

    /**
     * Returns id of a DOM element responsible for displaying a given
     * location path (clone of the view.locationPath).
     */
    function locationPathId(location) {
      return 'location-' + utils.urn2uuid(location.id);
    }

    /**
     * Returns id of a DOM element responsible for displaying a list
     * of users allowed to access a given location (clone of the
     * view.locationInfo).
     */
    function locationInfoId(location) {
      return 'location-info-' + utils.urn2uuid(location.id);
    }

    /**
     * Returns id of an input box responsible for adding emails of
     * users allowed to access a given location.
     */
    function addAllowedUserInputId(location) {
      return 'add-allowed-user-input-' + utils.urn2uuid(location.id);
    }

    /**
     * Returns an active location (the one for which a list of allowed
     * users is currently displayed) or null.
     */
    function findActiveLocation() {
      var activeElement, urn;
      activeElement = $('#location-list').find('.active');
      if (activeElement.length === 0) {
        return null;
      }
      urn = activeElement.attr('location-urn');
      return utils.findOnly(controller.locations, function(location) {
        return location.id === urn;
      });
    }

    /**
     * Displays a dialog to compose a notification about shared resources.
     */
    function showNotifyDialog(to, locations) {
      var body, website, locationsString, recipent = '', bcc = '';
      if (locations.length === 0) {
        body = 'I have shared nothing with you. Enjoy.';
      } else {
        website = 'a website';
        if (locations.length > 1) {
          website = 'websites';
        }
        locationsString = $.map(locations, function(locationPath) {
          return currentUrlRoot() + locationPath;
        }).join('\n');

        body = 'I have shared ' + website + ' with you.\n'
          + 'Please visit:\n' + locationsString;
      }
      if (to.length !== 0) {
        recipent = to[0];
        bcc = to.slice(1).join(',');
      }

      $('#notify-modal')
        .find('#notify-to').attr('value', to.join(', '))
        .end()
        .find('#notify-body').text(body)
        .end()
        .find('#send')
        .attr('href', 'mailto:' + encodeURIComponent(recipent) +
              '?subject=Invitation&bcc=' + encodeURIComponent(bcc)
              + '&body=' + encodeURIComponent(body))
        .end()
        .modal('show');
    }


    /**
     * Shortens a text of a child specified by the selector so it has
     * at most maxWidthPx pixels.
     *
     * If the text was shortened, appends '...' to the shortened text
     * and sets a tooltip on the parent with the original text value.
     *
     * Must be called on elements that are on the screen, because
     * width of other elements is 0.
     */
    function trimText(parent, selector, maxWidthPx, placement) {
      var inner = parent.find(selector), origText = inner.text(),
      text = origText;
      // Remove trailing characters one by one until length is acceptable.
      while (inner.width() > maxWidthPx) {
        text = text.slice(0, -1);
        inner.text(text);
      }
      if (text !== origText) {
        inner.text(text + '...');
        parent.attr('title', origText).tooltip({
          'placement': placement
        });
      }
      return parent;
    }

    function trimEmailsInActiveLocation() {
      // This can be done only when the active location is already on
      // the screen.
      $('#location-info-list .active')
        .find('li')
        .each(function() {
          trimText($(this), '.user-mail', MAX_EMAIL_WIDTH_PX, 'left');
        });
    }

    /**
     * Active location is the one for which detailed information and
     * controls are displayed.
     */
    function activateLocation(location) {
      // If any location is already active, deactivate it:
      $('#location-list').find('.active').removeClass('active');
      $('#location-info-list').find('.active').removeClass('active');

      $('#' + locationPathId(location)).addClass('active');
      $('#' + locationInfoId(location)).addClass('active');
    }

    function grantAccess(userId, location) {
      if (userId === '*') {
        controller.grantOpenAccess(location);
      } else if (userId !== '') {
        controller.grantAccess(userId, location);
      }
    }

    function inProgress(element, cssClass) {
      element.css('visibility', 'hidden');
      element.parent().addClass(cssClass);
    }

    function failedHandler(element, cssClass) {
      return function(message, status, isTextPlain) {
        element.parent().removeClass(cssClass);
        element.css('visibility', 'visible');
        that.handleError(message, status, isTextPlain);
      };
    }

    function removeInProgress(element) {
      inProgress(element, 'removing');
    }

    function removeFailedHandler(element) {
      return failedHandler(element, 'removing');
    }

    function grantingInProgress(element) {
      inProgress(element, 'granting');
    }

    function grantFailedHandler(element) {
      return failedHandler(element, 'granting');
    }

    /**
     * Creates a DOM subtree to handle an active location. The subtree
     * contains emails of allowed users, an input box to grant access
     * to a new user, controls to revoke access from a particular
     * user.
     */
    function showLocationInfo(location) {
      var locationView, allowedUserList, isAdminLocation;

      isAdminLocation = controller.handledByAdmin(location.path);

      locationView = view.locationInfo.clone(true)
        .attr('id', locationInfoId(location))
        .attr('location-urn', location.id)
        .find('.add-allowed-user')
        .attr('id', addAllowedUserInputId(location))
        .keyup(function(event) {
          var userId = $.trim($(this).val());
          if (event.which === ENTER_KEY) {
            grantAccess(userId, location);
            userId = '';
            $(this).val(userId);
          }
          if (userId !== '') {
            $(this).siblings('button').removeClass('disabled');
          } else {
            $(this).siblings('button').addClass('disabled');
          }
        })
        .end()
        .find('button').click(function() {
          var input = $(this).siblings('input'), userId = $.trim(input.val());
          grantAccess(userId, location);
          input.val('');
          $(this).addClass('disabled');
        })
        .end();

      allowedUserList = locationView.find('.allowed-user-list');
      if (location.hasOwnProperty('openAccess')) {
        // Disable entering email addresses of allowed user: everyone
        // is allowed.
        locationView.find('.add-allowed-user')
          .attr('placeholder', 'Everyone is allowed to access the location')
          .attr('disabled', true);

        view.allowedUser.clone(true)
          .find('.user-mail').text('*')
          .end()
          .find('.unshare').click(function() {
            controller.revokeOpenAccess(location);
          })
          .end()
          .appendTo(allowedUserList);
      } else {
        // When the first location on the list is disabled and the
        // page is refreshed, all locations become
        // disabled. Placeholder text is valid for them so it doesn't
        // seem like the first location is cloned.
        locationView.find('.add-allowed-user').attr('disabled', false);

        utils.each(
          utils.sortByProperty(location.allowedUsers, 'email'), function(user) {
            var isAdminUser = (user.email === controller.adminUserEmail);
            view.allowedUser.clone(true)
              .find('.user-mail').text(user.email + userAnnotation(user))
              .end()
              .find('.unshare').click(function() {
                removeInProgress($(this));
                controller.revokeAccess(
                  user, location, removeFailedHandler($(this)));
              })
              // Protect the currently signed-in user from disallowing
              // herself access to the admin application.
              .css('visibility',
                   isAdminLocation && isAdminUser ? 'hidden' : 'visible')
              .end()
              .appendTo(allowedUserList);
          });
      }
      locationView.appendTo('#location-info-list');
      // Break circular references.
      locationView = null;
      allowedUserList = null;
    }

    function showLocation(location) {
      var pathView, isAdminLocation;
      isAdminLocation = controller.handledByAdmin(location.path);
      pathView = view.locationPath.clone(true)
        .attr('id', locationPathId(location))
        .attr('location-urn', location.id)
        .find('.url').attr(
          'href', '#' + locationInfoId(location))
        .end()
        .find('.path').text(location.path)
        .end()
        .find('.remove-location').click(function(event) {
          removeInProgress($(this));
          controller.removeLocation(location, removeFailedHandler($(this)));
          // Do not propagate the event (not to show removed location info):
          return false;
        })
      // Do not allow admin location to be removed.
        .css('visibility', isAdminLocation ? 'hidden' : 'visible')
        .end()
        .find('.notify').click(function() {
          showNotifyDialog(
            utils.extractProperty(location.allowedUsers, 'email'),
            [location.path]);
        })
        .end()
        .find('.view-page').click(function() {
          window.open(location.path,'_blank');
        })
        .end()
        .appendTo('#location-list');
      trimText(pathView, '.path', MAX_PATH_WIDTH_PX, 'right');
      pathView = null;
      isAdminLocation = null;
    }

    /**
     * Creates a DOM subtree to handle a list of locations. The
     * subtree contains locations' paths, controls to add/remove a
     * location and to compose notifications, a link to visit a
     * location with a browser. For a currently active location more
     * details are visible (created with the showLocationInfo
     * function).
     */
    function showLocationsList(activeLocation) {
      utils.each(utils.sortByProperty(controller.locations, 'path'),
                 showLocation);

      view.addLocation.clone(true)
        .find('#add-location-input')
        .keyup(function(event) {
          var path = $.trim($(this).val());
          if (event.which === ENTER_KEY) {
            if (path !== '') {
              controller.addLocation(path);
            }
            path = '';
            $(this).val(path);
          }
          if (path === '') {
            $('#add-location-button').addClass('disabled');
          } else {
            $('#add-location-button').removeClass('disabled');
          }
        })
        .end()
        .find('#add-location-button')
        .click(function() {
          var input = $('#add-location-input'), path = $.trim(input.val());
          if (path !== '') {
            controller.addLocation(path);
          }
          input.val('');
          $(this).addClass('disabled');
        })
        .end()
        .appendTo('#location-list');

      if (activeLocation !== null) {
        showLocationInfo(activeLocation);
        activateLocation(activeLocation);
        // Must be called after activateLocation().
        trimEmailsInActiveLocation();
      }
    }

    function showAlias(alias) {
      var aliasView = view.alias.clone(true),
      isCurrentUrl = (alias.url === currentUrlRoot());

      aliasView.find('.url').text(alias.url + aliasAnnotation(alias))
        .end()
        .find('.remove-alias').click(function(event) {
          removeInProgress($(this));
          controller.removeAlias(alias, removeFailedHandler($(this)));
          return false;
        })
        .css('visibility', isCurrentUrl ? 'hidden' : 'visible')
        .end()
        .find('.view-page').click(function() {
          window.open(alias.url,'_blank');
        })
        .end()
        .appendTo('#alias-list');
      trimText(aliasView, '.url', MAX_ALIAS_WIDTH_PX, 'right');
      aliasView = null;
    }

    function showAliasesList() {
      utils.each(utils.sort(controller.aliases, function(a, b) {
        var partsA = a.url.split('://'),
        partsB = b.url.split('://'),
        result = utils.compare(partsA[1], partsB[1]);
        if (result === 0) {
          // Domains are the same, compare schemes.
          return utils.compare(partsA[0], partsB[0]);
        }
        return result;
      }), showAlias);

      function addAliasCommon(url) {
        var input = $('#add-alias-input');
        url = $.trim(input.val());
        if (url !== '') {
          controller.addAlias($('#add-alias-scheme').val() + url);
        }
        input.val('');
        $('#add-alias-button').addClass('disabled');
      }

      $('#add-alias-input')
        .keyup(function(event) {
          if (event.which === ENTER_KEY) {
            addAliasCommon();
          } else if ($(this).val() === '') {
            $('#add-alias-button').addClass('disabled');
          } else {
            $('#add-alias-button').removeClass('disabled');
          }
        })
        .end();
      $('#add-alias-button')
        .click(addAliasCommon)
        .end();
    }

    /**
     * Highlights locations a user can access.
     */
    function highlightAccessibleLocations(user) {
      utils.each(controller.locations, function(location) {
        var id = '#' + locationPathId(location);
        if (controller.canAccess(user, location)) {
          $(id + ' .can-access').removeClass('invisible');
        } else {
          $(id + ' .can-access').addClass('visible');
        }
      });
    }

    /**
     * Turns off location highlighting.
     */
    function highlighLocationsOff() {
      $('#location-list .can-access').addClass('invisible');
    }

    function showUser(user, activeLocation) {
      var userView = view.user.clone(true), isAdminUser;

      if (activeLocation !== null &&
          !controller.canAccess(user, activeLocation)) {
        userView.find('.share')
          .removeClass('invisible')
          .click(function() {
            grantingInProgress($(this));
            controller.grantAccess(
              user.email, activeLocation, grantFailedHandler($(this)));
          });
      }

      isAdminUser = (user.email === controller.adminUserEmail);
      userView
        .hover(function() {
          highlightAccessibleLocations(user);
        }, highlighLocationsOff)
        .find('.user-mail')
        .text(user.email + userAnnotation(user))
        .end()
        .find('.remove-user').click(function() {
          removeInProgress($(this));
          controller.removeUser(user, removeFailedHandler($(this)));
        })
      // Do not allow currently signed-in user to delete herself
      // (this is only UI enforced, from a server perspective such
      // operation is OK).
        .css('visibility', isAdminUser ? 'hidden' : 'visible')
        .end()
        .find('.notify').click(function() {
          showNotifyDialog(
            [user.email],
            utils.extractProperty(
              controller.accessibleLocations(user), 'path')
          );
        })
        .end()
        .appendTo('#user-list');
      trimText(userView, '.user-mail', MAX_EMAIL_WIDTH_PX, 'right');
      userView = null;
    }

    /**
     * Creates a DOM subtree to handle a list of known users. The
     * subtree contains an email of each user and controls to remove a
     * user, highlight which locations a user can access, notify a
     * user about shared locations. It also contains a control to
     * grant a user access to a currently active location (this
     * control is visible only if the user can not already access the
     * location).
     */
    function showUsersList(activeLocation) {
      utils.each(utils.sortByProperty(controller.users, 'email'),
                 function(user) {
                   showUser(user, activeLocation);
                 });
    }

    /**
     * Enables a 'Save' button if any site customization inputs are
     * changed, otherwise disables the button.
     */
    function toggleSaveButton() {
      if ($('#custom-login i:not(.invisible)').length === 0 &&
          $('#branding').prop('checked') === controller.skin.branding) {
        $('#custom-login-save').addClass('disabled');
      } else {
        $('#custom-login-save').removeClass('disabled');
      }
    }

    /**
     * Configures controls to customize the wwwhisper login page.
     */
    function showCustomizeLogin() {
      var inputChangedHandler = function() {
        var revert = $(this).siblings('.revert');
        // Shows a revert icon beside all changed inputs.
        if ($(this).val() !== controller.skin[$(this).attr('id')]) {
          revert.removeClass('invisible');
        } else {
          revert.addClass('invisible');
        }
        toggleSaveButton();
      };
      $('#custom-login input:text').each(function() {
        var field = $(this).attr('id');
        $(this).val(controller.skin[field]);
        $(this).siblings('.revert').click(function() {
          $(this).siblings('input').val(controller.skin[field]);
          $(this).addClass('invisible');
          toggleSaveButton();
        }).addClass('invisible');
        $(this).change(inputChangedHandler);
        // Redundant, but for input fields change() is not fired until
        // focus is changed, and keyup() is not fired when the input is
        // changes with a mouse (for example on copy-paste).
        $(this).keyup(inputChangedHandler);
      });
      // Branding checkbox does not have the revert icon.
      $('#branding').prop('checked', controller.skin.branding)
        .change(toggleSaveButton);
      toggleSaveButton();
    }

    function saveCusomizedLogin() {
      var skin = {};
      $('#custom-login input:text').each(function() {
        var field = $(this).attr('id');
        skin[field] = $(this).val();
      });
      skin.branding = $('#branding').prop('checked');
      controller.updateSkin(skin);
    }

    /**
     * Returns a hash part of the current url (without '#') or 'acl'
     * if the hash part is empty.
     */
    function activeHash() {
      var hash = location.hash.replace(/^#/, '');
      if (loading) {
        return 'loading';
      }
      if (hash === '' || hash === null) {
        return 'acl';
      }
      return hash;
    }

    /**
     * Changes the main content that is displayed on the screen
     * (access control UI or site settings etc.).
     */
    function showContainer(containerClass) {
      $('.container.content').addClass('hide');
      $('.container.content.' + containerClass).removeClass('hide');
    }

    function showContainerPointedByHash() {
      showContainer(activeHash());
    }

    function hashChanged() {
      showContainerPointedByHash();
      that.refresh();
    }

    /**
     * Provides a basic support for browsers that do not expose
     * hashchanged event. Containers are changed only on menu clicks
     * (back, forward buttons are not supported).
     */
    function hashClickedHandler(hash) {
      return function() {
        showContainer(hash);
        that.refresh();
      };
    }

    /**
     * Handles errors. Not HTTP related errors (status undefined)
     * or HTTP errors with plain text messages are displayed and
     * automatically hidden after some time.
     *
     * Authentication needed error (401) indicates that the user
     * signed-out - admin page is reloaded to show a login prompt.
     *
     * Errors without plain text messages are considered fatal -
     * received error message replaces the current document.
     */
    this.handleError = function(message, status, isTextPlain) {
      // Scroll to make sure error is visible.
      $(document).scrollTop(0);
      $(document).scrollLeft(0);

      if (status === undefined || status === 401 || isTextPlain) {
        var error = view.errorMessage.clone(true);

        if (status === 401) {
          // User signed out, reload the admin page.
          window.location.reload(true);
        }

        error.removeClass('hide')
          .find('.alert-message')
          .text(message)
          .end()
          .appendTo('.' + activeHash() +  ' > .error-box');

        window.setTimeout(function() {
          error.alert('close');
        }, 15000);
      } else {
        // Fatal error.
        $('html').html(message);
      }
    };

    /**
     * Refreshes all controls. Displayed data (with the exception of
     * an error message) is never updated partially. All UI elements
     * are cleared and recreated. If locationToActivate is given, it
     * becomes activated, otherwise currently active location stays
     * active or if none, the first location in alphabetical order.
     */
    this.refresh = function(locationToActivate) {
      var focusedElementId, activeLocation = locationToActivate,
      scrollTop = $(document).scrollTop(),
      scrollLeft = $(document).scrollLeft();

      loading = false;

      if (locationToActivate === undefined) {
        // DOM subtrees representing a currently focused input box and
        // an active location will be removed, corresponding elements in
        // a new DOM structure need to be focused and activated.
        activeLocation = findActiveLocation();
      }
      // Active location was probably just removed, activate the first
      // location on the list.
      if (activeLocation === null && controller.locations.length > 0) {
        activeLocation = utils.sortByProperty(controller.locations, 'path')[0];
      }

      focusedElementId = focusedElement().attr('id');

      $('#alias-list').empty();
      $('#location-list').empty();
      $('#location-info-list').empty();
      $('#user-list').empty();

      showAliasesList(activeLocation);
      showLocationsList(activeLocation);
      showUsersList(activeLocation);
      showCustomizeLogin();

      if (focusedElementId) {
        $('#' + focusedElementId).focus();
      }
      // Rewind a document to where it was.
      $(document).scrollTop(scrollTop);
      $(document).scrollLeft(scrollLeft);
      showContainerPointedByHash();
    };

    /**
     * Must be called before the first call to refresh().
     */
    this.setController = function(controllerArg) {
      controller = controllerArg;
    };

    /**
     * Initializes the UI.
     */
    function initialize() {
      // locationInfo contains a single allowed user element from the
      // html document. Remove it.
      view.locationInfo.find('#allowed-user-list-item').remove();

      // Refreshes the UI when new location is activated (to update
      // the user list, so only users that can not access the location
      // have active 'share' icon).
      view.locationPath.find('a').click(function(e) {
        e.preventDefault();
        $(this).tab('show');
        that.refresh();
      });

      // TODO: this is only needed if alert is to be removed programmatically.
      $(".alert").alert();

      // Configure static help messages.
      $('.help').click(function() {
        if ($('.help-message').hasClass('hide')) {
          $('.help-message').removeClass('hide');
          $('.help').text('Hide help');
        } else {
          $('.help-message').addClass('hide');
          $('.help').text('Show help');
        }
      });
      if (window.onhashchange !== undefined) {
        $(window).on('hashchange', hashChanged);
      } else {
        // Dinosaur browsers.
        $('.acl').click(hashClickedHandler('acl'));
        $('.settings').click(hashClickedHandler('settings'));
      }
      $('#custom-login-save').click(saveCusomizedLogin);
    }
    initialize();
  }

  function initialize() {
    var ui, stub, controller;
    // UI depends on controller, but can be created without it.
    ui = new UI();
    stub = new wwwhisper.Stub(ui);
    controller = new Controller(ui, stub);
    ui.setController(controller);
    controller.activate();
  }

  if (window.ExposeForTests) {
    // For qunit tests, expose objects to be tested.
    window.utils = utils;
    window.Controller = Controller;
  } else {
    initialize();
  }
}());
