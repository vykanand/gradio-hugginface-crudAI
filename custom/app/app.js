/* global angular */

const app = angular.module("MTapp", ["ui.bootstrap"]);

// deepcode ignore JS-D008: AngularJS filter registration pattern
app.filter("startFrom", () => {
  return (input, start) => {
    if (input) {
      start = Number(start); //parse to int
      return input.slice(start);
    }
    return [];
  };
});

// deepcode ignore JS-D008: AngularJS filter registration pattern
app.filter("vla", () => {
  return (str) => {
    const frags = str.split("_");
    for (let i = 0; i < frags.length; i++) {
      frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1);
    }
    return frags.join(" ");
  };
});

// deepcode ignore JS-D008: AngularJS filter registration pattern
app.filter("dateDisplay", () => {
  return (dateValue) => {
    if (!dateValue) return dateValue;
    
    // If it's a Date object
    if (dateValue instanceof Date) {
      const dd = ('0' + dateValue.getDate()).slice(-2);
      const mm = ('0' + (dateValue.getMonth() + 1)).slice(-2);
      const yyyy = dateValue.getFullYear();
      return dd + '-' + mm + '-' + yyyy;
    }
    
    // If it's a string in YYYY-MM-DD format
    if (typeof dateValue === 'string') {
      const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return match[3] + '-' + match[2] + '-' + match[1]; // DD-MM-YYYY
      }
    }
    
    return dateValue;
  };
});

app.controller("mtctrl", function ($scope, $http, $location, $uibModal, $q, $timeout) {
  // console.log(localStorage.getItem("apikey"));
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  const basePath = window.location.pathname.split('/')[1];
  $scope.url = `${protocol}//${hostname}${port}/${basePath}/api`;
  // Strict: orchestration endpoints MUST come from central `/orchestration.config.json` only.
  // Do not use any window-level fallback or client-side defaults.
  let orchBase = '';
  $scope.orchConfig = null;
  $scope.orchServerUrl = '';

  // Resolve orchestration URLs strictly from central config. Returns full URL string or null if not resolvable.
  function orchUrl(pathOrKey) {
    // Require central config and orchestration_server_url
    if (!$scope.orchConfig || !$scope.orchConfig.orchestration_server_url) return null;
    const base = ($scope.orchConfig.orchestration_server_url || '').toString().replace(/\/$/, '');
    if (!pathOrKey) return base;

    // If a leading slash is passed, append as path to base
    if (pathOrKey.startsWith('/')) return base + pathOrKey;

    // Otherwise treat as a key and lookup in api_paths
    if ($scope.orchConfig.api_paths && $scope.orchConfig.api_paths[pathOrKey]) {
      const mapped = $scope.orchConfig.api_paths[pathOrKey];
      if (!mapped) return null;
      if (/^https?:\/\//i.test(mapped)) return mapped; // mapped absolute URL
      if (mapped.startsWith('/')) return base + mapped;
      return base + '/' + mapped;
    }

    // Not configured — do not use any fallback
    return null;
  }

  // Event-driven architecture: CRUD operations publish events to Kafka
  // Workflows subscribe to events they care about - no binding configuration needed

    // Publish a CRUD event to orchestration system with full traceability
    $scope.publishCrudEvent = function(action, payload) {
      try {
        // Generate unique trace ID for end-to-end visibility
        const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const eventObj = {
          traceId: traceId,                  // Unique ID tracked through entire system
          contractVersion: '1.0',
          eventType: 'CRUD',
          action: action,                    // 'create', 'update', 'delete'
          module: $scope.moduleKey || (window.__MODULE_NAME__ || document.body.getAttribute('data-module') || ''),
          timestamp: new Date().toISOString(),
          payload: payload || {},
          userId: $scope.userdata?.id,       // Who triggered the action
          sessionId: $scope.sessionId        // Browser session tracking
        };
        
        // Publish to Kafka via monitor endpoint
        fetch('/monitor/publish', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ subject: 'ORCHESTRATIONS_EVENTS', payload: eventObj }) 
        })
        .then(response => {
          if (response.ok) {
            console.log(`[${traceId}] CRUD event published: ${action} on ${eventObj.module}`);
          }
        })
        .catch(error => {
          console.error(`[${traceId}] Failed to publish CRUD event:`, error);
        });
        
        // Return trace ID for optional UI tracking
        return traceId;
      } catch (e) { 
        console.warn('publishCrudEvent error', e); 
        return null;
      }
    };

  // compute module key once for the page (used for bindings lookup)
  try {
    // Priority:
    // 1. `window.__MODULE_NAME__` if host app explicitly sets it
    // 2. `data-module` attribute on body
    // 3. Derive from URL path: use the folder name that contains this page (parent directory)
    let inferred = '';
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        // e.g. /some/path/module/boot.html -> module is second-to-last segment
        inferred = parts[parts.length - 2];
      } else if (parts.length === 1) {
        // e.g. /module or /boot.html served from /module/ -> fallback to first segment
        inferred = parts[0];
      }
    } catch (e) { inferred = ''; }
    $scope.moduleKey = (window.__MODULE_NAME__ || document.body.getAttribute('data-module') || inferred || '').toString();
  } catch (e) { $scope.moduleKey = ''; }

  // Event-driven architecture: No custom row buttons or bindings modal needed
  // All CRUD operations automatically publish events that workflows can subscribe to
                }
              }
              $scope.orchBindings = norm;
              window.top.postMessage('success^Bindings saved', '*');
              modalInstance.close();
            } else {
              window.top.postMessage('error^Failed to save bindings', '*');
            }
          }).catch(e => { window.top.postMessage('error^Bindings save error', '*'); });
      };

      modalScope.cancel = function () { modalInstance.dismiss('cancel'); };

      // build modal template
      const tpl = `
        <div class="modal-header"><h3 class="modal-title">Bindings for module: ${$scope.moduleKey}</h3></div>
        <div class="modal-body" style="max-height:60vh;overflow:auto;">
          <div class="form-group">
            <label>Create</label>
            <select class="form-control" ng-model="bindings.create" ng-options="o.id as (o.name || o.id) for o in orchestrations"><option value="">-- none --</option></select>
          </div>
          <div class="form-group">
            <label>Read</label>
            <select class="form-control" ng-model="bindings.read" ng-options="o.id as (o.name || o.id) for o in orchestrations"><option value="">-- none --</option></select>
          </div>
          <div class="form-group">
            <label>Update</label>
            <select class="form-control" ng-model="bindings.update" ng-options="o.id as (o.name || o.id) for o in orchestrations"><option value="">-- none --</option></select>
          </div>
          <div class="form-group">
            <label>Delete</label>
            <select class="form-control" ng-model="bindings.delete" ng-options="o.id as (o.name || o.id) for o in orchestrations"><option value="">-- none --</option></select>
          </div>
          <hr />
          <h4>Custom Row Buttons</h4>
          <p>Add buttons that will appear on each row and execute an orchestration with the clicked row as input.</p>
          <div ng-repeat="(idx, cb) in customButtons track by $index" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input class="form-control" ng-model="cb.label" placeholder="Button label" />
            <select class="form-control" ng-model="cb.orchestrationId" ng-options="o.id as (o.name || o.id) for o in orchestrations"><option value="">-- select orch --</option></select>
            <button class="btn btn-danger" ng-click="removeCustomButton($index)">Remove</button>
          </div>
          <div style="margin-top:8px;">
            <button class="btn btn-secondary" ng-click="addCustomButton()">Add Button</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" ng-click="save()">Save</button>
          <button class="btn btn-default" ng-click="cancel()">Cancel</button>
        </div>
      `;

      const modalInstance = $uibModal.open({ template: tpl, scope: modalScope, size: 'lg' });
    }).catch(e => console.warn('openBindings failed', e));
  };
  // deepcode ignore JS-0002: Development logging for API endpoint debugging
  if (typeof console !== 'undefined') console.log('API Base URL:', $scope.url);
  const passphrase = "yug";
  
  // Initialize field-plugin mapping
  $scope.fieldPluginMap = {};
  
  // Initialize field-type mapping
  $scope.fieldTypeMap = {};
  
  // Initialize field-required mapping
  $scope.fieldRequiredMap = {};

  $scope.humanize = function (str) {
    if (!str) return '';
    const frags = str.split("_");
    for (let i = 0; i < frags.length; i++) {
      frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1);
    }
    return frags.join(" ");
  };

  $scope.removefromArray = function (array, ...items) {
    return array.filter((item) => !items.includes(item));
  };

  $scope.removeFromObject = function (obj, ...properties) {
    // Create new object with all properties except those in properties array
    return Object.keys(obj)
      .filter((key) => !properties.includes(key))
      .reduce((newObj, key) => {
        newObj[key] = obj[key];
        return newObj;
      }, {});
  };

  $scope.setPage = function (pageNo) {
    $scope.currentPage = pageNo;
    // Allow DOM to update with new page content
    $scope.adjustCells();
  };

  $scope.filter = function () {
    $timeout(function () {
      if ($scope.list && Array.isArray($scope.list)) {
        $scope.filteredItems = $scope.list.length;
      } else {
        $scope.filteredItems = 0;
      }
    }, 10);
  };

  $scope.sort_by = function (predicate) {
    $scope.predicate = predicate;
    $scope.reverse = !$scope.reverse;
  };

  // Watch for pagination changes
  $scope.$watch("currentPage", function (newPage) {
    if (newPage) {
      console.log("Current page:", newPage);
      $scope.adjustCells();
    }
  });

  $scope.adjustCells = function () {
    setTimeout(() => {
      console.log("adjustCells called");
      var cells = document.getElementsByTagName("td");
      Array.from(cells).forEach(function (cell) {
        var text = cell.textContent.trim();
        if (text.startsWith("https")) {
          if (text.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            cell.innerHTML = `
                    <a href="${text}" target="_blank">
                        <img src="${text}" style="max-width: 100px; max-height: 100px;">
                    </a>`;
          } else {
            cell.innerHTML = `<a href="${text}" target="_blank">${text}</a>`;
          }
        }
      });
    }, 100);
  };

  $scope.trans = function (obj) {
    var str = [];
    for (var p in obj) {
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    }
    return str.join("&");
  };

  $scope.login = function (user, pass) {
    var str = pass;

    var regex = new RegExp(passphrase, "g");
    var resx = str.match(regex);
    var pass = 0;
    if (resx) {
      if (resx.length > 0) {
        pass = 1;
        window.location.href = "adm.html";
        console.log("found");
      } else {
        console.log("notfound");
      }
    } else {
      // notie.alert({ type: 'error', text: '', stay: false })
      window.top.postMessage("error^Wrong password", "*");
      // alert("Wrong password");
      window.location.href = "index.html";
    }
  };

  $scope.cancelbt = function () {
    if ($scope.modalInstance) {
      $scope.modalInstance.dismiss("cancel");
    }
    document.getElementById("mainsection").classList.remove("blurcontent");
  };

  $scope.flfl = function () {
    // console.log($scope.filtered);
    var pp = [];
    for (let i = 0; i < $scope.filtered.length; i++) {
      pp.push($scope.filtered[i].id);
    }
    // console.log(pp);
    $http.get($scope.url + "?deliid=true&iid=" + pp).success(function (data) {
      console.log(data);
    });
  };

  $scope.admin = function () {
    $scope.userdata = JSON.parse(localStorage.getItem("userdat"));
    $scope.userole = $scope.userdata.role;
    
    // Helper function to convert field values based on their types
    $scope.convertFieldValue = function (fieldName, value) {
      if (value === null || value === undefined) return value;
      
      // Look up field type (try multiple key formats)
      const fieldLower = fieldName.toLowerCase();
      const fieldUnderscore = fieldLower.replace(/ /g, '_');
      const fieldType = ($scope.fieldTypeMap && 
        ($scope.fieldTypeMap[fieldName] || 
         $scope.fieldTypeMap[fieldLower] || 
         $scope.fieldTypeMap[fieldUnderscore])) || 'text';
      
      // Convert based on type
      if (fieldType === 'number' || fieldType === 'range') {
        const num = Number(value);
        return isNaN(num) ? value : num;
      } else if (fieldType === 'checkbox') {
        // Convert comma-separated string to array for checkboxes
        if (typeof value === 'string' && value.trim() !== '') {
          return value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; });
        } else if (Array.isArray(value)) {
          return value;
        }
        return [];
      } else if (fieldType === 'date' || fieldType === 'datetime-local') {
        // Convert date/datetime strings to Date objects for Angular input compatibility
        if (typeof value === 'string' && value.trim() !== '') {
          const parsed = new Date(value);
          if (!isNaN(parsed.getTime())) {
            return parsed;
          }
        }
        return value;
      } else if (fieldType === 'time' || fieldType === 'month' || fieldType === 'week') {
        // Keep time, month, week as strings (Angular expects string format for these)
        return String(value);
      }
      // Return as-is for text, email, url, etc.
      return value;
    };
    
    // Helper function to convert all fields in an object
    $scope.convertObjectFields = function (obj) {
      if (!obj || typeof obj !== 'object') return obj;
      const converted = {};
      Object.keys(obj).forEach(function (key) {
        converted[key] = $scope.convertFieldValue(key, obj[key]);
      });
      return converted;
    };
    
    // Helper to format Date object to YYYY-MM-DD for saving
    $scope.formatDateForSave = function (date) {
      if (!date || !(date instanceof Date)) return date;
      const yyyy = date.getFullYear();
      const mm = ('0' + (date.getMonth() + 1)).slice(-2);
      const dd = ('0' + date.getDate()).slice(-2);
      return yyyy + '-' + mm + '-' + dd;
    };
    
    // Helper to format Date object to YYYY-MM-DDTHH:MM for datetime-local
    $scope.formatDateTimeForSave = function (date) {
      if (!date || !(date instanceof Date)) return date;
      const yyyy = date.getFullYear();
      const mm = ('0' + (date.getMonth() + 1)).slice(-2);
      const dd = ('0' + date.getDate()).slice(-2);
      const hh = ('0' + date.getHours()).slice(-2);
      const mins = ('0' + date.getMinutes()).slice(-2);
      return yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + mins;
    };
    
    // Helper to format date string for display (DD-MM-YYYY)
    $scope.formatDateForDisplay = function (dateStr) {
      if (!dateStr || typeof dateStr !== 'string') return dateStr;
      // Try to parse YYYY-MM-DD format
      const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return match[3] + '-' + match[2] + '-' + match[1]; // DD-MM-YYYY
      }
      return dateStr;
    };
    
    // Helper to check if value looks like a date string
    $scope.isDateString = function (value) {
      if (!value) return false;
      if (value instanceof Date) return true;
      if (typeof value === 'string') {
        // Check for YYYY-MM-DD pattern
        return /^\d{4}-\d{2}-\d{2}/.test(value);
      }
      return false;
    };
    
    // Helper to determine if a field is a checkbox field
    $scope.isCheckboxField = function (fieldName, value) {
      // First check if field type is explicitly set to checkbox
      var fieldType = $scope.getFieldType(fieldName);
      if (fieldType === 'checkbox') {
        return true;
      }
      // Also detect if value is an array (likely checkbox data)
      if (Array.isArray(value) && value.length > 0) {
        return true;
      }
      return false;
    };
    
    // Helper to parse checkbox array values (converts string or array to array)
    $scope.parseCheckboxValue = function (value) {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        return value.split(',').map(function(v) { return v.trim(); }).filter(function(v) { return v !== ''; });
      }
      return [];
    };
    
    // Helper function to get options array for a field
    $scope.getFieldOptions = function (fieldName) {
      if (!$scope.fieldOptionsMap) return [];
      const fieldLower = fieldName.toLowerCase();
      const fieldUnderscore = fieldLower.replace(/ /g, '_');
      return $scope.fieldOptionsMap[fieldName] || 
             $scope.fieldOptionsMap[fieldLower] || 
             $scope.fieldOptionsMap[fieldUnderscore] || 
             [];
    };
    
    // Helper function to get field type
    $scope.getFieldType = function (fieldName) {
      if (!$scope.fieldTypeMap) return 'text';
      const fieldLower = fieldName.toLowerCase();
      const fieldUnderscore = fieldLower.replace(/ /g, '_');
      return $scope.fieldTypeMap[fieldName] || 
             $scope.fieldTypeMap[fieldLower] || 
             $scope.fieldTypeMap[fieldUnderscore] || 
             'text';
    };
    
    // Load plugin mappings from database
    $http.get($scope.url + "?getpluginmap=true")
      .success(function (pluginData) {
        console.log('Plugin mappings loaded:', pluginData);
        // Normalize mapping keys so lookups succeed even if keys differ by case or spaces
        $scope.fieldPluginMap = {};
        try {
          if (pluginData && typeof pluginData === 'object') {
            Object.keys(pluginData).forEach(function (origKey) {
              var val = pluginData[origKey];
              // store original key
              $scope.fieldPluginMap[origKey] = val;
              // store lowercase key
              $scope.fieldPluginMap[origKey.toLowerCase()] = val;
              // store underscore-normalized key
              $scope.fieldPluginMap[origKey.toLowerCase().replace(/\s+/g, '_')] = val;
            });
          }
        } catch (e) {
          console.error('Error normalizing plugin mappings', e);
          $scope.fieldPluginMap = pluginData || {};
        }
        console.log('Normalized fieldPluginMap:', $scope.fieldPluginMap);
      })
      .error(function () {
        console.log('Failed to load plugin mappings, using empty map');
        $scope.fieldPluginMap = {};
      });
    
    // Load field type mappings from database
    $http.get($scope.url + "?getfieldtypes=true")
      .success(function (fieldTypeData) {
        console.log('Field type mappings loaded:', fieldTypeData);
        // Normalize mapping keys so lookups succeed even if keys differ by case or spaces
        $scope.fieldTypeMap = {};
        try {
          if (fieldTypeData && typeof fieldTypeData === 'object') {
            Object.keys(fieldTypeData).forEach(function (origKey) {
              var val = fieldTypeData[origKey];
              // store original key
              $scope.fieldTypeMap[origKey] = val;
              // store lowercase key
              $scope.fieldTypeMap[origKey.toLowerCase()] = val;
              // store underscore-normalized key
              $scope.fieldTypeMap[origKey.toLowerCase().replace(/\s+/g, '_')] = val;
            });
          }
        } catch (e) {
          console.error('Error normalizing field type mappings', e);
          $scope.fieldTypeMap = fieldTypeData || {};
        }
        console.log('Normalized fieldTypeMap:', $scope.fieldTypeMap);
      })
      .error(function () {
        console.log('Failed to load field type mappings, using empty map');
        $scope.fieldTypeMap = {};
      });
    
    // Load field required mappings from database
    $http.get($scope.url + "?getfieldrequired=true")
      .success(function (fieldRequiredData) {
        console.log('Field required mappings loaded:', fieldRequiredData);
        // Normalize mapping keys so lookups succeed even if keys differ by case or spaces
        $scope.fieldRequiredMap = {};
        try {
          if (fieldRequiredData && typeof fieldRequiredData === 'object') {
            Object.keys(fieldRequiredData).forEach(function (origKey) {
              var val = fieldRequiredData[origKey];
              // coerce value to boolean if possible
              var coerced = val;
              if (typeof coerced === 'string') {
                var low = coerced.toLowerCase().trim();
                coerced = (low === 'true' || low === '1' || low === 'yes' || low === 'on');
              } else {
                coerced = Boolean(coerced);
              }
              // store original key
              $scope.fieldRequiredMap[origKey] = coerced;
              // store lowercase key
              $scope.fieldRequiredMap[origKey.toLowerCase()] = coerced;
              // store underscore-normalized key
              $scope.fieldRequiredMap[origKey.toLowerCase().replace(/\s+/g, '_')] = coerced;
            });
          }
        } catch (e) {
          console.error('Error normalizing field required mappings', e);
          $scope.fieldRequiredMap = fieldRequiredData || {};
        }
        console.log('Normalized fieldRequiredMap:', $scope.fieldRequiredMap);
      })
      .error(function () {
        console.log('Failed to load field required mappings, using empty map');
        $scope.fieldRequiredMap = {};
      });
    
    // Load field options mappings from database
    $http.get($scope.url + "?getfieldoptions=true")
      .success(function (fieldOptionsData) {
        console.log('Field options mappings loaded:', fieldOptionsData);
        // Normalize mapping keys and split options into arrays
        $scope.fieldOptionsMap = {};
        try {
          if (fieldOptionsData && typeof fieldOptionsData === 'object') {
            Object.keys(fieldOptionsData).forEach(function (origKey) {
              var val = fieldOptionsData[origKey];
              // Split comma-separated string into array, trim whitespace
              var optionsArray = [];
              if (typeof val === 'string' && val.trim() !== '') {
                optionsArray = val.split(',').map(function(opt) { return opt.trim(); }).filter(function(opt) { return opt !== ''; });
              } else if (Array.isArray(val)) {
                optionsArray = val;
              }
              // store original key
              $scope.fieldOptionsMap[origKey] = optionsArray;
              // store lowercase key
              $scope.fieldOptionsMap[origKey.toLowerCase()] = optionsArray;
              // store underscore-normalized key
              $scope.fieldOptionsMap[origKey.toLowerCase().replace(/\s+/g, '_')] = optionsArray;
            });
          }
        } catch (e) {
          console.error('Error normalizing field options mappings', e);
          $scope.fieldOptionsMap = {};
        }
        console.log('Normalized fieldOptionsMap:', $scope.fieldOptionsMap);
      })
      .error(function () {
        console.log('Failed to load field options mappings, using empty map');
        $scope.fieldOptionsMap = {};
      });
    
    $http
      .get($scope.url + "?getcontent=true&role=" + $scope.userole)
      .success(function (data) {
        console.log(data);

        // Convert field values based on their types
        if (data && Array.isArray(data) && data.length > 0) {
          $scope.list = data.map(function (row) {
            return $scope.convertObjectFields(row);
          });
        } else {
          $scope.list = data;
        }

        localStorage.setItem("getcontent", JSON.stringify($scope.list));

        if ($scope.list && $scope.list.length > 0) {
          $scope.showdat = Object.keys($scope.list[0]);
          for (var i = 0; i < $scope.showdat.length; i++) {
            $scope.showdat[i] = $scope.humanize($scope.showdat[i]);
          }

          // delete $scope.list.created_at;
          $scope.rawFields = Object.keys($scope.list[0]);
          $scope.fields = [...$scope.rawFields];

          $http
            .get($scope.url + "?getfirstcontent=true&role=" + $scope.userole)
            .success(function (data) {
              // data is an array of column names; build an object for addingNew with raw keys
              console.log("getfirstcontent got data in first attempt", data);
              try {
                var addObj = {};
                if (Array.isArray(data)) {
                  data.forEach(function (col) {
                    // Initialize based on field type from fieldTypeMap
                    var colLower = col.toLowerCase();
                    var colUnderscore = colLower.replace(/ /g, '_');
                    var fieldType = ($scope.fieldTypeMap && ($scope.fieldTypeMap[col] || $scope.fieldTypeMap[colLower] || $scope.fieldTypeMap[colUnderscore])) || 'text';
                    
                    if (fieldType === 'number' || fieldType === 'range') {
                      addObj[col] = 0; // Initialize number fields with 0
                    } else {
                      addObj[col] = ''; // Initialize text fields with empty string
                    }
                  });
                } else if (typeof data === 'object' && data !== null) {
                  // fallback - convert object keys to initial empty values
                  Object.keys(data).forEach(function (col) {
                    var colLower = col.toLowerCase();
                    var colUnderscore = colLower.replace(/ /g, '_');
                    var fieldType = ($scope.fieldTypeMap && ($scope.fieldTypeMap[col] || $scope.fieldTypeMap[colLower] || $scope.fieldTypeMap[colUnderscore])) || 'text';
                    
                    if (fieldType === 'number' || fieldType === 'range') {
                      addObj[col] = 0;
                    } else {
                      addObj[col] = '';
                    }
                  });
                }
                // Remove system columns if present
                delete addObj.id;
                delete addObj.role;
                delete addObj.created_at;
                delete addObj.updated_at;

                $scope.addingNew = addObj;
              } catch (e) {
                console.error('Error building addingNew object from getfirstcontent', e);
                $scope.addingNew = {};
              }

              console.log("after building addingNew", $scope.addingNew);
              window.top.postMessage("responseact", "*");

              $scope.adjustCells();

            });

          for (var i = 0; i < $scope.fields.length; i++) {
            $scope.fields[i] = $scope.humanize($scope.fields[i]);
          }

          console.log("fields", $scope.fields);
          $scope.idun = data[0].id;
          $scope.currentPage = 1; //current page
          $scope.entryLimit = 5; //max no of items to display in a page
          $scope.filteredItems = $scope.list.length; //Initially for no filter S
        } else {
          console.log("nodata");

          $http
            .get($scope.url + "?getfirstcontent=true&role=" + $scope.userdata.role)
            .success(function (data) {
              console.log(
                "getfirstcontent else data coz nodata 2nd attempt",
                data
              );
              // Build addingNew object same as above
              try {
                var addObj2 = {};
                if (Array.isArray(data)) {
                  data.forEach(function (col) {
                    var colLower = col.toLowerCase();
                    var colUnderscore = colLower.replace(/ /g, '_');
                    var fieldType = ($scope.fieldTypeMap && ($scope.fieldTypeMap[col] || $scope.fieldTypeMap[colLower] || $scope.fieldTypeMap[colUnderscore])) || 'text';
                    
                    if (fieldType === 'number' || fieldType === 'range') {
                      addObj2[col] = 0;
                    } else if (fieldType === 'checkbox') {
                      addObj2[col] = {}; // checkbox uses object format for ng-model binding
                    } else if (fieldType === 'select' || fieldType === 'radio') {
                      // Set to first option if available, otherwise empty string
                      var options = $scope.getFieldOptions(col);
                      addObj2[col] = (options && options.length > 0) ? options[0] : '';
                    } else {
                      addObj2[col] = '';
                    }
                  });
                } else if (typeof data === 'object' && data !== null) {
                  Object.keys(data).forEach(function (col) {
                    var colLower = col.toLowerCase();
                    var colUnderscore = colLower.replace(/ /g, '_');
                    var fieldType = ($scope.fieldTypeMap && ($scope.fieldTypeMap[col] || $scope.fieldTypeMap[colLower] || $scope.fieldTypeMap[colUnderscore])) || 'text';
                    
                    if (fieldType === 'number' || fieldType === 'range') {
                      addObj2[col] = 0;
                    } else if (fieldType === 'checkbox') {
                      addObj2[col] = {}; // checkbox uses object format for ng-model binding
                    } else if (fieldType === 'select' || fieldType === 'radio') {
                      // Set to first option if available, otherwise empty string
                      var options = $scope.getFieldOptions(col);
                      addObj2[col] = (options && options.length > 0) ? options[0] : '';
                    } else {
                      addObj2[col] = '';
                    }
                  });
                }
                delete addObj2.id;
                delete addObj2.role;
                delete addObj2.created_at;
                delete addObj2.updated_at;
                $scope.addingNew = addObj2;
              } catch (e) {
                console.error('Error building addingNew object (nodata branch)', e);
                $scope.addingNew = {};
              }

              console.log("addingnew when no data found", $scope.addingNew);
              $scope.addproduct();
              window.top.postMessage("responseact", "*");
            });
        }
      });
  };
  
  var amodalPopup = function () {
    document.getElementById("mainsection").classList.add("blurcontent");

    return ($scope.modalInstance = $uibModal.open({
      animation: true,
      templateUrl: "blocks/modal/create.html",
      scope: $scope,
    }));
  };

  $scope.addproduct = function () {
    var modalPromise = amodalPopup();

    // Wait for modal to be fully rendered and initialize number inputs
    modalPromise.rendered.then(function () {
      $("#adtfrm")
        .find("input")
        .each(function () {
          var rawName = $(this).attr("name") || '';
          var fieldName = rawName.toLowerCase().replace(/ /g, "_");
          var type = ($scope.fieldTypeMap && ($scope.fieldTypeMap[rawName] || $scope.fieldTypeMap[rawName.toLowerCase()] || $scope.fieldTypeMap[fieldName])) || $(this).attr('type') || 'text';

          // Initialize number/range inputs with numeric value (0 or empty)
          if (type === 'number' || type === 'range') {
            if ($scope.addingNew && typeof $scope.addingNew[rawName] !== 'undefined') {
              var val = $scope.addingNew[rawName];
              if (val !== '' && val !== null) {
                var numVal = Number(val);
                if (!isNaN(numVal)) {
                  try {
                    if (!$scope.$$phase) {
                      $scope.$apply(function () { $scope.addingNew[rawName] = numVal; });
                    } else {
                      $scope.addingNew[rawName] = numVal;
                    }
                  } catch (e) {
                    // ignore
                  }
                }
              }
            }
          }
        });
    });

    modalPromise.result
      .then(function (data) {})
      .then(null, function (reason) {
        document.getElementById("mainsection").classList.remove("blurcontent");
      });
  };

  // Helper to get expected format description for field types
  $scope.getExpectedFormat = function(type) {
    if (!type) return '';
    type = String(type).toLowerCase();
    var formats = {
      'email': 'user@example.com',
      'url': 'https://example.com',
      'tel': '123-456-7890',
      'number': '123.45',
      'time': 'HH:MM',
      'date': 'YYYY-MM-DD',
      'datetime-local': 'YYYY-MM-DD HH:MM',
      'month': 'YYYY-MM',
      'week': 'YYYY-Www',
      'color': '#FF0000'
    };
    return formats[type] || '';
  };

  // Format time for database storage (HH:MM:SS)
  $scope.formatTimeForSave = function(value) {
    if (!value) return '';
    if (value instanceof Date) {
      var hours = ('0' + value.getHours()).slice(-2);
      var minutes = ('0' + value.getMinutes()).slice(-2);
      var seconds = ('0' + value.getSeconds()).slice(-2);
      return hours + ':' + minutes + ':' + seconds;
    }
    // If already a string in time format, return as is
    if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value)) {
      return value;
    }
    return String(value);
  };

  // Format date for database storage (YYYY-MM-DD)
  $scope.formatDateForSave = function(value) {
    if (!value) return '';
    if (value instanceof Date) {
      var year = value.getFullYear();
      var month = ('0' + (value.getMonth() + 1)).slice(-2);
      var day = ('0' + value.getDate()).slice(-2);
      return year + '-' + month + '-' + day;
    }
    // If already a string in date format, return as is
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value;
    }
    return String(value);
  };

  // Format datetime for database storage (YYYY-MM-DD HH:MM:SS)
  $scope.formatDateTimeForSave = function(value) {
    if (!value) return '';
    if (value instanceof Date) {
      var year = value.getFullYear();
      var month = ('0' + (value.getMonth() + 1)).slice(-2);
      var day = ('0' + value.getDate()).slice(-2);
      var hours = ('0' + value.getHours()).slice(-2);
      var minutes = ('0' + value.getMinutes()).slice(-2);
      var seconds = ('0' + value.getSeconds()).slice(-2);
      return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
    }
    // If already a string in datetime format, return as is
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value;
    }
    return String(value);
  };

  // Validation helpers: validate by type and validate entire form
  $scope.validateValueByType = function (value, type) {
    if (value === null || typeof value === 'undefined') return false;
    var v = String(value).trim();
    if (v === '') return false; // Empty string is invalid
    if (type === undefined || type === null) type = 'text';
    type = String(type).toLowerCase();
    if (type === 'text' || type === 'search' || type === 'password' || type === 'textarea') return true;
    if (type === 'email') {
      var re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i;
      return re.test(v);
    }
    if (type === 'number' || type === 'range') {
      return !isNaN(v) && v !== '';
    }
    if (type === 'url') {
      try {
        // Use simple URL constructor; fall back to regex if not supported
        new URL(v);
        return true;
      } catch (e) {
        var reu = /^(https?:\/\/)?([\w\-])+\.{1}([\w\-\.])+(:\d+)?(\/.*)?$/i;
        return reu.test(v);
      }
    }
    if (type === 'tel') {
      var reTel = /^[0-9 \-()+]+$/;
      return reTel.test(v);
    }
    if (type === 'time') {
      // Validate time format HH:MM or HH:MM:SS - accept any existing data as valid if validation fails
      var timeRe = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
      // Allow any non-empty value to pass for time type to avoid blocking valid data
      return v !== '';
    }
    if (type === 'month') {
      // Validate month format YYYY-MM
      var monthRe = /^\d{4}-(?:0[1-9]|1[0-2])$/;
      return monthRe.test(v) || v !== ''; // Allow any non-empty value
    }
    if (type === 'week') {
      // Validate week format YYYY-Www
      var weekRe = /^\d{4}-W(?:0[1-9]|[1-4][0-9]|5[0-3])$/;
      return weekRe.test(v) || v !== ''; // Allow any non-empty value
    }
    if (type.indexOf('date') !== -1 || type === 'datetime-local') {
      // For date and datetime-local, try Date.parse but allow any non-empty value
      var t = Date.parse(v);
      return !isNaN(t) || v !== '';
    }
    if (type === 'color') {
      // Validate color format #RRGGBB or allow any non-empty value
      var colorRe = /^#[0-9A-F]{6}$/i;
      return colorRe.test(v) || v !== '';
    }
    if (type === 'select' || type === 'radio' || type === 'checkbox') {
      // These types are always valid if they have a value
      return true;
    }
    // default allow any non-empty value
    return v !== '';
  };

  $scope.validateForm = function (formSelector) {
    var valid = true;
    var firstInvalid = null;
    
    // Clear all previous validation highlights
    $(formSelector).find('input, select, textarea').removeClass('field-invalid');
    $(formSelector).find('.checkbox-group-invalid, .radio-group-invalid').removeClass('checkbox-group-invalid radio-group-invalid');
    
    // For add/edit modals, validate against scope data instead of DOM
    var isAddModal = formSelector === '#adtfrm';
    var isEditModal = formSelector === '#edtfrm';
    var dataSource = isAddModal ? $scope.addingNew : (isEditModal ? $scope.edls : null);
    
    if (dataSource) {
      // Validate using scope data - more reliable for all field types
      Object.keys(dataSource).forEach(function(fieldName) {
        // Skip system fields
        if (fieldName === 'id' || fieldName === 'role' || fieldName === 'created_at' || fieldName === 'updated_at') {
          return;
        }
        
        var value = dataSource[fieldName];
        var fieldType = $scope.getFieldType(fieldName);
        var isRequired = $scope.fieldRequiredMap && (
          $scope.fieldRequiredMap[fieldName] || 
          $scope.fieldRequiredMap[fieldName.toLowerCase()] || 
          $scope.fieldRequiredMap[fieldName.toLowerCase().replace(/ /g, '_')]
        );
        
        // Check if value is empty
        var isEmpty = false;
        if (fieldType === 'checkbox' && Array.isArray(value)) {
          isEmpty = value.length === 0;
        } else if (value === null || value === undefined || value === '') {
          isEmpty = true;
        } else if (typeof value === 'string' && value.trim() === '') {
          isEmpty = true;
        }
        
        // Validate if required or has value
        if (isRequired && isEmpty) {
          valid = false;
          console.warn('Validation failed: Required field "' + fieldName + '" is empty, Type:', fieldType);
          
          // Try multiple name variations to find the field
          var fieldVariations = [
            fieldName,
            fieldName.toLowerCase(),
            fieldName.toLowerCase().replace(/ /g, '_'),
            fieldName.replace(/_/g, ' '),
            fieldName.toLowerCase().replace(/_/g, ' '),
            fieldName.charAt(0).toUpperCase() + fieldName.slice(1).toLowerCase()
          ];
          
          var $field = null;
          
          // Highlight the field based on type
          if (fieldType === 'checkbox') {
            // Find checkbox group - try to find parent div with ng-if for this field
            for (var i = 0; i < fieldVariations.length && !$field; i++) {
              var selector = '[ng-if*="' + fieldVariations[i] + '"]';
              var $checkboxDiv = $(formSelector).find(selector).filter(function() {
                return $(this).find('input[type="checkbox"]').length > 0;
              });
              if ($checkboxDiv.length > 0) {
                $field = $checkboxDiv;
                $field.addClass('checkbox-group-invalid');
                if (!firstInvalid) firstInvalid = $field.find('input[type="checkbox"]').get(0);
                console.log('Highlighted checkbox group for field:', fieldName);
                break;
              }
            }
          } else if (fieldType === 'radio') {
            // Find radio group
            for (var i = 0; i < fieldVariations.length && !$field; i++) {
              var $radioDiv = $(formSelector).find('[ng-if*="' + fieldVariations[i] + '"]').filter(function() {
                return $(this).find('input[type="radio"]').length > 0;
              });
              if ($radioDiv.length > 0) {
                $field = $radioDiv;
                $field.addClass('radio-group-invalid');
                if (!firstInvalid) firstInvalid = $field.find('input[type="radio"]').get(0);
                console.log('Highlighted radio group for field:', fieldName);
                break;
              }
            }
          } else {
            // Find input/select/textarea by trying all name variations
            for (var i = 0; i < fieldVariations.length && !$field; i++) {
              var $found = $(formSelector).find('[name="' + fieldVariations[i] + '"]');
              if ($found.length > 0) {
                $field = $found.first();
                // Use setTimeout to ensure Angular has finished processing and add debugging
                setTimeout(function(field, fieldName, fieldType) {
                  field.addClass('field-invalid');
                  console.log('Applied field-invalid class to element:', field.attr('name'), 'Classes now:', field.attr('class'), 'Has field-invalid:', field.hasClass('field-invalid'));
                  
                  // Also try adding a more specific class that won't conflict
                  field.addClass('validation-error-highlight');
                  
                  // Force style application with higher specificity
                  field.attr('style', field.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
                  
                  // Clear the current value and set expected format placeholder
                  field.val('');
                  var expectedFormat = $scope.getExpectedFormat(fieldType);
                  if (expectedFormat) {
                    field.attr('placeholder', 'Expected: ' + expectedFormat);
                  }
                  
                  console.log('Forced inline styles applied to field:', fieldName, 'type:', fieldType);
                }, 0, $field, fieldName, fieldType);
                if (!firstInvalid) firstInvalid = $field.get(0);
                console.log('Highlighted field "' + fieldName + '" (type: ' + fieldType + ') using name variation:', fieldVariations[i]);
                break;
              }
            }
            
            // If still not found, try by ID
            if (!$field) {
              for (var i = 0; i < fieldVariations.length && !$field; i++) {
                var $found = $(formSelector).find('#input-' + fieldVariations[i]);
                if ($found.length > 0) {
                  $field = $found.first();
                  // Use setTimeout to ensure Angular has finished processing and add debugging
                  setTimeout(function(field, fieldName, fieldType) {
                    field.addClass('field-invalid');
                    console.log('Applied field-invalid class to element:', field.attr('name'), 'Classes now:', field.attr('class'), 'Has field-invalid:', field.hasClass('field-invalid'));
                    
                    // Also try adding a more specific class that won't conflict
                    field.addClass('validation-error-highlight');
                    
                    // Force style application with higher specificity
                    field.attr('style', field.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
                    
                    // Clear the current value and set expected format placeholder
                    field.val('');
                    var expectedFormat = $scope.getExpectedFormat(fieldType);
                    if (expectedFormat) {
                      field.attr('placeholder', 'Expected: ' + expectedFormat);
                    }
                    
                    console.log('Forced inline styles applied to field:', fieldName, 'type:', fieldType);
                  }, 0, $field, fieldName, fieldType);
                  if (!firstInvalid) firstInvalid = $field.get(0);
                  console.log('Highlighted field "' + fieldName + '" (type: ' + fieldType + ') using ID:', 'input-' + fieldVariations[i]);
                  break;
                }
              }
            }
            
            // Last resort: scan all inputs/selects/textareas and match by ng-model
            if (!$field) {
              var modelName = isAddModal ? 'addingNew[' + fieldName + ']' : 'edls[' + fieldName + ']';
              $(formSelector).find('input, select, textarea').each(function() {
                var ngModel = $(this).attr('ng-model');
                if (ngModel && (ngModel === modelName || ngModel.indexOf(fieldName) !== -1)) {
                  $field = $(this);
                  // Use setTimeout to ensure Angular has finished processing and add debugging
                  setTimeout(function(field, fieldName, fieldType) {
                    field.addClass('field-invalid');
                    console.log('Applied field-invalid class to element:', field.attr('name'), 'Classes now:', field.attr('class'), 'Has field-invalid:', field.hasClass('field-invalid'));
                    
                    // Also try adding a more specific class that won't conflict
                    field.addClass('validation-error-highlight');
                    
                    // Force style application with higher specificity
                    field.attr('style', field.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
                    
                    // Clear the current value and set expected format placeholder
                    field.val('');
                    var expectedFormat = $scope.getExpectedFormat(fieldType);
                    if (expectedFormat) {
                      field.attr('placeholder', 'Expected: ' + expectedFormat);
                    }
                    
                    console.log('Forced inline styles applied to field:', fieldName, 'type:', fieldType);
                  }, 0, $field, fieldName, fieldType);
                  if (!firstInvalid) firstInvalid = $field.get(0);
                  console.log('Highlighted field "' + fieldName + '" (type: ' + fieldType + ') using ng-model:', ngModel);
                  return false; // break
                }
              });
            }
          }
          
          if (!$field) {
            console.error('Could not find DOM element to highlight for required field:', fieldName, 'Type:', fieldType, 'Tried variations:', fieldVariations);
            // Debug: list all available name attributes in the form
            var allNames = [];
            $(formSelector).find('input, select, textarea').each(function() {
              var n = $(this).attr('name');
              if (n) allNames.push(n);
            });
            console.log('Available name attributes in form:', allNames);
          }
        } else if (!isEmpty && fieldType !== 'select' && fieldType !== 'radio' && fieldType !== 'checkbox' && fieldType !== 'textarea') {
          // Validate value format for standard input types
          var valueStr = (value instanceof Date) ? value.toISOString() : String(value);
          if (!$scope.validateValueByType(valueStr, fieldType)) {
            valid = false;
            console.warn('Validation failed: Field "' + fieldName + '" has invalid format for type ' + fieldType + ', Value:', valueStr);
            
            // Try multiple name variations to find the field
            var fieldVariations = [
              fieldName,
              fieldName.toLowerCase(),
              fieldName.toLowerCase().replace(/ /g, '_'),
              fieldName.replace(/_/g, ' '),
              fieldName.toLowerCase().replace(/_/g, ' ')
            ];
            
            var $field = null;
            for (var i = 0; i < fieldVariations.length && !$field; i++) {
              var $found = $(formSelector).find('[name="' + fieldVariations[i] + '"]');
              if ($found.length > 0) {
                $field = $found.first();
                // Use setTimeout to ensure Angular has finished processing and add debugging
                setTimeout(function(field, fieldName, fieldType) {
                  field.addClass('field-invalid');
                  console.log('Applied field-invalid class to element:', field.attr('name'), 'Classes now:', field.attr('class'), 'Has field-invalid:', field.hasClass('field-invalid'));
                  
                  // Also try adding a more specific class that won't conflict
                  field.addClass('validation-error-highlight');
                  
                  // Force style application with higher specificity
                  field.attr('style', field.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
                  
                  // Clear the current value and set expected format placeholder
                  field.val('');
                  var expectedFormat = $scope.getExpectedFormat(fieldType);
                  if (expectedFormat) {
                    field.attr('placeholder', 'Expected: ' + expectedFormat);
                  }
                  
                  console.log('Forced inline styles applied to field:', fieldName, 'type:', fieldType);
                }, 0, $field, fieldName, fieldType);
                if (!firstInvalid) firstInvalid = $field.get(0);
                
                // Set placeholder with expected format
                var expectedFormat = $scope.getExpectedFormat(fieldType);
                if (expectedFormat) {
                  $field.attr('placeholder', 'Expected: ' + expectedFormat);
                }
                
                console.log('Highlighted invalid format field "' + fieldName + '" (type: ' + fieldType + ') using name variation:', fieldVariations[i]);
                break;
              }
            }
            
            // Try by ID if name search failed
            if (!$field) {
              for (var i = 0; i < fieldVariations.length && !$field; i++) {
                var $found = $(formSelector).find('#input-' + fieldVariations[i]);
                if ($found.length > 0) {
                  $field = $found.first();
                  // Use setTimeout to ensure Angular has finished processing and add debugging
                  setTimeout(function(field, fieldName, fieldType) {
                    field.addClass('field-invalid');
                    console.log('Applied field-invalid class to element:', field.attr('name'), 'Classes now:', field.attr('class'), 'Has field-invalid:', field.hasClass('field-invalid'));
                    
                    // Also try adding a more specific class that won't conflict
                    field.addClass('validation-error-highlight');
                    
                    // Force style application with higher specificity
                    field.attr('style', field.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
                    
                    // Clear the current value and set expected format placeholder
                    field.val('');
                    var expectedFormat = $scope.getExpectedFormat(fieldType);
                    if (expectedFormat) {
                      field.attr('placeholder', 'Expected: ' + expectedFormat);
                    }
                    
                    console.log('Forced inline styles applied to field:', fieldName, 'type:', fieldType);
                  }, 0, $field, fieldName, fieldType);
                  if (!firstInvalid) firstInvalid = $field.get(0);
                  
                  // Set placeholder with expected format
                  var expectedFormat = $scope.getExpectedFormat(fieldType);
                  if (expectedFormat) {
                    $field.attr('placeholder', 'Expected: ' + expectedFormat);
                  }
                  
                  console.log('Highlighted invalid format field "' + fieldName + '" (type: ' + fieldType + ') using ID:', 'input-' + fieldVariations[i]);
                  break;
                }
              }
            }
            
            // Last resort: scan by ng-model - enhanced for email fields
            if (!$field) {
              var modelName = isAddModal ? 'addingNew[' + fieldName + ']' : 'edls[' + fieldName + ']';
              console.log('DEBUG EMAIL: Looking for field "' + fieldName + '" with type "' + fieldType + '" using ng-model scan');
              console.log('DEBUG EMAIL: Expected ng-model:', modelName);
              
              $(formSelector).find('input, select, textarea').each(function() {
                var ngModel = $(this).attr('ng-model');
                var inputType = $(this).attr('type');
                var inputName = $(this).attr('name');
                
                console.log('DEBUG EMAIL: Checking element - name:', inputName, 'type:', inputType, 'ng-model:', ngModel);
                
                if (ngModel && (ngModel === modelName || ngModel.indexOf(fieldName) !== -1)) {
                  $field = $(this);
                  // Use setTimeout to ensure Angular has finished processing and add debugging
                  setTimeout(function(field, fieldName, fieldType) {
                    field.addClass('field-invalid');
                    console.log('Applied field-invalid class to element:', field.attr('name'), 'Classes now:', field.attr('class'), 'Has field-invalid:', field.hasClass('field-invalid'));
                    
                    // Also try adding a more specific class that won't conflict
                    field.addClass('validation-error-highlight');
                    
                    // Force style application with higher specificity
                    field.attr('style', field.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
                    
                    // Clear the current value and set expected format placeholder
                    field.val('');
                    var expectedFormat = $scope.getExpectedFormat(fieldType);
                    if (expectedFormat) {
                      field.attr('placeholder', 'Expected: ' + expectedFormat);
                    }
                    
                    console.log('Forced inline styles applied to field:', fieldName, 'type:', fieldType);
                  }, 0, $field, fieldName, fieldType);
                  if (!firstInvalid) firstInvalid = $field.get(0);
                  
                  // Set placeholder with expected format
                  var expectedFormat = $scope.getExpectedFormat(fieldType);
                  if (expectedFormat) {
                    $field.attr('placeholder', 'Expected: ' + expectedFormat);
                  }
                  
                  console.log('Highlighted invalid format field "' + fieldName + '" (type: ' + fieldType + ') using ng-model:', ngModel);
                  return false; // break
                }
              });
              
              // Additional check for email fields specifically
              if (!$field && fieldType === 'email') {
                console.log('DEBUG EMAIL: Special email field search for "' + fieldName + '"');
                $(formSelector).find('input[type="email"]').each(function() {
                  var ngModel = $(this).attr('ng-model');
                  var inputName = $(this).attr('name');
                  
                  console.log('DEBUG EMAIL: Found email input - name:', inputName, 'ng-model:', ngModel);
                  
                  // Check if this email input matches our field
                  if (inputName === fieldName || 
                      inputName === fieldName.toLowerCase() || 
                      inputName === fieldName.toLowerCase().replace(/ /g, '_') ||
                      (ngModel && ngModel.indexOf(fieldName) !== -1)) {
                    $field = $(this);
                    // Use setTimeout to ensure Angular has finished processing and add debugging
                    setTimeout(function(field, fieldName, fieldType) {
                      field.addClass('field-invalid');
                      console.log('Applied field-invalid class to element:', field.attr('name'), 'Classes now:', field.attr('class'), 'Has field-invalid:', field.hasClass('field-invalid'));
                      
                      // Also try adding a more specific class that won't conflict
                      field.addClass('validation-error-highlight');
                      
                      // Force style application with higher specificity
                      field.attr('style', field.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
                      
                      // Clear the current value and set expected format placeholder
                      field.val('');
                      var expectedFormat = $scope.getExpectedFormat(fieldType);
                      if (expectedFormat) {
                        field.attr('placeholder', 'Expected: ' + expectedFormat);
                      }
                      
                      console.log('Forced inline styles applied to field:', fieldName, 'type:', fieldType);
                    }, 0, $field, fieldName, fieldType);
                    if (!firstInvalid) firstInvalid = $field.get(0);
                    
                    var expectedFormat = $scope.getExpectedFormat(fieldType);
                    if (expectedFormat) {
                      $field.attr('placeholder', 'Expected: ' + expectedFormat);
                    }
                    
                    console.log('DEBUG EMAIL: Found and highlighted email field "' + fieldName + '" with name:', inputName);
                    return false; // break
                  }
                });
              }
            }
            
            if (!$field) {
              console.error('Could not find DOM element to highlight for invalid field:', fieldName, 'Type:', fieldType);
              // Debug: list all available inputs in the form
              var allInputs = [];
              $(formSelector).find('input').each(function() {
                var n = $(this).attr('name');
                var t = $(this).attr('type');
                var m = $(this).attr('ng-model');
                if (n) allInputs.push({name: n, type: t, ngModel: m});
              });
              console.log('Available input elements in form:', allInputs);
            }
          }
        }
      });
    } else {
      // Fallback to DOM-based validation for other forms
      $(formSelector)
        .find('input, select, textarea')
        .each(function () {
          var $inp = $(this);
          var rawName = $inp.attr('name') || '';
          var type = $scope.getFieldType(rawName) || $inp.attr('type') || 'text';
          var required = $scope.fieldRequiredMap && (
            $scope.fieldRequiredMap[rawName] || 
            $scope.fieldRequiredMap[rawName.toLowerCase()] || 
            $scope.fieldRequiredMap[rawName.toLowerCase().replace(/ /g, '_')]
          );
          var val = $inp.val();

          var isEmpty = (val === null || typeof val === 'undefined' || String(val).trim() === '');
          var ok = true;
          if (required && isEmpty) {
            ok = false;
          } else if (!isEmpty) {
            ok = $scope.validateValueByType(val, type);
          }

          if (!ok) {
            valid = false;
            // Use setTimeout to ensure Angular has finished processing and add debugging
            setTimeout(function(inp) {
              inp.addClass('field-invalid');
              console.log('Applied field-invalid class to fallback element:', inp.attr('name'), 'Classes now:', inp.attr('class'), 'Has field-invalid:', inp.hasClass('field-invalid'));
              
              // Also try adding a more specific class that won't conflict
              inp.addClass('validation-error-highlight');
              
              // Force style application with higher specificity
              inp.attr('style', inp.attr('style') + '; border: 2px solid #e74c3c !important; box-shadow: 0 0 0 3px rgba(231,76,60,0.3) !important; background-color: #fff7f7 !important;');
              
              // Clear the current value and set expected format placeholder
              inp.val('');
              var expectedFormat = $scope.getExpectedFormat(type);
              if (expectedFormat) {
                inp.attr('placeholder', 'Expected: ' + expectedFormat);
              }
              
              console.log('Forced inline styles applied to fallback field');
            }, 0, $inp);
            if (!firstInvalid) firstInvalid = $inp.get(0);
          }
        });
    }

    return { valid: valid, first: firstInvalid };
  };

  $scope.crtpag = function (action) {
    var addata = {};
    
    // Collect data from $scope.addingNew for all field types
    Object.keys($scope.addingNew).forEach(function(fieldName) {
      var value = $scope.addingNew[fieldName];
      var fieldType = $scope.getFieldType(fieldName);
      
      // Format values based on type
      if (fieldType === 'time') {
        addata[fieldName] = $scope.formatTimeForSave(value);
      } else if (fieldType === 'date') {
        addata[fieldName] = $scope.formatDateForSave(value);
      } else if (fieldType === 'datetime-local') {
        addata[fieldName] = $scope.formatDateTimeForSave(value);
      } else if (fieldType === 'checkbox') {
        // Handle checkbox array format
        if (Array.isArray(value)) {
          addata[fieldName] = value.filter(function(v) { return v !== undefined && v !== null && v !== ''; }).join(',');
        } else {
          addata[fieldName] = '';
        }
      } else if (value !== undefined && value !== null) {
        addata[fieldName] = value;
      } else {
        addata[fieldName] = '';
      }
    });

    // Add user type from localStorage
    addata["role"] = $scope.userdata.role;
    localStorage.setItem("addDto", JSON.stringify(addata));
    addata[action] = true;

    console.log("=== ADD MODAL DATA COLLECTION ===");
    console.log("Action:", action);
    console.log("Field types:", $scope.fieldTypeMap);
    console.log("Raw addingNew:", $scope.addingNew);
    console.log("Formatted addata:", addata);
    console.log("POST URL:", $scope.url);
    
    var url = $scope.url;

    // validate inputs before posting
    var validation = $scope.validateForm('#adtfrm');
    console.log("Validation result:", validation.valid);
    if (!validation.valid) {
      // focus first invalid input and notify parent
      if (validation.first) {
        validation.first.focus();
      }
      window.top.postMessage('error^Please fix highlighted fields before submitting', '*');
      return;
    }

    // If there's a binding for this module+action, run orchestration instead of default API
    try {
      const moduleKey = (window.__MODULE_NAME__ || document.body.getAttribute('data-module') || window.location.pathname.split('/')[1] || '').toString();
      const binding = ($scope.orchBindings && $scope.orchBindings[moduleKey] && $scope.orchBindings[moduleKey]['create']) || null;
      if (binding && action === 'setcontent') {
        // run orchestration by binding (supports sync/async)
        $scope.invokeOrchestrationByBinding(binding, addata)
          .then(resp => {
            if (resp && (resp.executionId || resp.success)) {
              window.top.postMessage('success^Created Successfully (via orchestration)', '*');
            } else {
              window.top.postMessage('error^Orchestration failed to queue', '*');
            }
            window.location.reload();
          }).catch(e => { window.top.postMessage('error^Orchestration error', '*'); window.location.reload(); });
        return;
      }
    } catch (e) { console.warn('binding check failed', e); }

    // Publish CRUD event - workflows will react automatically
    try { 
      const traceId = $scope.publishCrudEvent('create', addata); 
      console.log(`[${traceId}] Create event published for module`);
    } catch (e) { 
      console.warn('publishCrudEvent create failed', e); 
    }

    //post req start (default behaviour)
    $http({
      method: "POST",
      url: url,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      transformRequest: function (obj) {
        var str = [];
        for (var p in obj) {
          if (obj.hasOwnProperty(p)) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
          }
        }
        return str.join("&");
      },
      data: addata,
    })
      .success(function (response) {
        console.log(response + $scope.url);
        window.top.postMessage("success^Created Successfully", "*");
        window.location.reload();
      })
      .catch(function onError(response) {
        window.top.postMessage("error^Some Error Occured", "*");
        window.location.reload();
      });
  };

  $scope.eee = function () {
    function JSON2CSV(objArray) {
      var array = typeof objArray != "object" ? JSON.parse(objArray) : objArray;
      var str = "";
      var line = "";

      if ($("#labels").is(":checked")) {
        var head = array[0];
        if ($("#quote").is(":checked")) {
          for (var index in array[0]) {
            if (array[0].hasOwnProperty(index)) {
              var value = String(index);
              line += '"' + value.replace(/"/g, '""') + '",';
            }
          }
        } else {
          for (var index in array[0]) {
            if (array[0].hasOwnProperty(index)) {
              line += index + ",";
            }
          }
        }

        line = line.slice(0, -1);
        str += line + "\r\n";
      }

      for (var i = 0; i < array.length; i++) {
        var line = "";

        if ($("#quote").is(":checked")) {
          for (var index in array[i]) {
            if (array[i].hasOwnProperty(index)) {
              var value = String(array[i][index]);
              line += '"' + value.replace(/"/g, '""') + '",';
            }
          }
        } else {
          for (var index in array[i]) {
            if (array[i].hasOwnProperty(index)) {
              line += array[i][index] + ",";
            }
          }
        }

        line = line.slice(0, -1);
        str += line + "\r\n";
      }
      return str;
    }

    var json_pre = localStorage.getItem("csvs");

    console.log(json_pre);
    var json = $.parseJSON(json_pre);

    var csv = JSON2CSV(json);
    var downloadLink = document.createElement("a");
    var blob = new Blob(["\ufeff", csv]);
    var url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = "data.csv";

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  $scope.edityes = function (vx, id) {
    // validate edit form before collecting data
    var validation = $scope.validateForm('#edtfrm');
    if (!validation.valid) {
      if (validation.first) validation.first.focus();
      window.top.postMessage('error^Please fix highlighted fields before submitting', '*');
      return;
    }

    var eddata = {};
    
    // Collect data from $scope.edls for all field types (handles select/radio/checkbox better)
    Object.keys($scope.edls).forEach(function(fieldName) {
      // Skip Angular internal properties and system fields (but keep role)
      if (fieldName.indexOf('$$') === 0 || fieldName === 'id' || fieldName === 'created_at' || fieldName === 'updated_at') {
        return; // skip system fields and Angular properties
      }
      
      var value = $scope.edls[fieldName];
      var fieldLower = fieldName.toLowerCase();
      var fieldUnderscore = fieldLower.replace(/ /g, '_');
      var fieldType = $scope.getFieldType(fieldName);
      
      // Format values based on type
      if (fieldType === 'time') {
        eddata[fieldUnderscore] = $scope.formatTimeForSave(value);
      } else if (fieldType === 'date') {
        eddata[fieldUnderscore] = $scope.formatDateForSave(value);
      } else if (fieldType === 'datetime-local') {
        eddata[fieldUnderscore] = $scope.formatDateTimeForSave(value);
      } else if (fieldType === 'checkbox') {
        // Handle checkbox - array format only
        if (Array.isArray(value)) {
          eddata[fieldUnderscore] = value.filter(function(v) { return v !== undefined && v !== null && v !== ''; }).join(',');
        } else {
          eddata[fieldUnderscore] = '';
        }
      } else if (value !== undefined && value !== null) {
        eddata[fieldUnderscore] = value;
      } else {
        eddata[fieldUnderscore] = '';
      }
    });

    eddata["id"] = $scope.edtid;
    eddata["role"] = $scope.userdata.role;
    eddata[vx] = true;
    
    console.log("=== EDIT MODAL DATA COLLECTION ===");
    console.log("Action:", vx);
    console.log("Edit ID:", $scope.edtid);
    console.log("Field types:", $scope.fieldTypeMap);
    console.log("Raw edls:", $scope.edls);
    console.log("Formatted eddata:", eddata);
    console.log("POST URL:", $scope.url);
    // Publish CRUD event - workflows will react automatically
    try { 
      const traceId = $scope.publishCrudEvent('update', eddata); 
      console.log(`[${traceId}] Update event published`);
    } catch (e) { 
      console.warn('publishCrudEvent update failed', e); 
    }

    //post req start
    $http({
      method: "POST",
      url: $scope.url,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      transformRequest: function (obj) {
        var str = [];
        for (var p in obj) {
          if (obj.hasOwnProperty(p)) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
          }
        }
        return str.join("&");
      },
      data: eddata,
    })
      .success(function (response) {
        console.log(response);
        // alert('Edited successfully');
        window.top.postMessage("success^Edited Successfully", "*");
        // notie.alert({ type: 'success', text: 'Edited Successfully', stay: false })
        window.location.reload();
      })
      .catch(function onError(response) {
        // alert('Some error occured');
        window.top.postMessage("error^Some Error Occured", "*");
        // notie.alert({ type: 'error', text: 'Some error occured', stay: false })
        window.location.reload();
      });
    //post req ends
  };

  var emodalPopup = function () {
    document.getElementById("mainsection").classList.add("blurcontent");
    return ($scope.modalInstance = $uibModal.open({
      animation: true,
      templateUrl: "blocks/modal/edit.html",
      scope: $scope,
    }));
  };
  
  // Helper function to toggle checkbox values in add modal
  $scope.toggleCheckboxAdd = function (fieldKey, option) {
    if (!$scope.addingNew[fieldKey]) {
      $scope.addingNew[fieldKey] = [];
    }
    
    // Ensure it's an array
    if (!Array.isArray($scope.addingNew[fieldKey])) {
      $scope.addingNew[fieldKey] = [];
    }
    
    var index = $scope.addingNew[fieldKey].indexOf(option);
    if (index > -1) {
      // Remove option
      $scope.addingNew[fieldKey].splice(index, 1);
    } else {
      // Add option
      $scope.addingNew[fieldKey].push(option);
    }
  };
  
  // Helper function to toggle checkbox values in edit modal
  $scope.toggleCheckbox = function (fieldKey, option) {
    if (!$scope.edls[fieldKey]) {
      $scope.edls[fieldKey] = [];
    }
    
    // Ensure it's an array
    if (typeof $scope.edls[fieldKey] === 'string') {
      // Convert comma-separated string to array
      $scope.edls[fieldKey] = $scope.edls[fieldKey].split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; });
    }
    
    if (!Array.isArray($scope.edls[fieldKey])) {
      $scope.edls[fieldKey] = [];
    }
    
    var index = $scope.edls[fieldKey].indexOf(option);
    if (index > -1) {
      // Remove option
      $scope.edls[fieldKey].splice(index, 1);
    } else {
      // Add option
      $scope.edls[fieldKey].push(option);
    }
  };
  
  $scope.editproduct = function (dta) {
    console.log("original edit data", dta);
    
    // Convert all fields in dta based on their types before using
    const convertedData = $scope.convertObjectFields(dta);
    console.log("converted edit data", convertedData);
    
    $scope.edls = $scope.removeFromObject(convertedData, "role", "created_at");
    localStorage.setItem("editDto", JSON.stringify($scope.edls));
    $scope.edtid = convertedData.id;

    // Open modal first
    var modalPromise = emodalPopup();

    // Helper to find value in convertedData using multiple key variants
    var findValueInData = function(inputName, convertedData) {
      // Try exact match first
      if (convertedData.hasOwnProperty(inputName)) {
        return { found: true, key: inputName, value: convertedData[inputName] };
      }
      
      // Try lowercase
      var lowerName = inputName.toLowerCase();
      if (convertedData.hasOwnProperty(lowerName)) {
        return { found: true, key: lowerName, value: convertedData[lowerName] };
      }
      
      // Try with underscores instead of spaces
      var underscoreName = inputName.replace(/\s+/g, '_');
      if (convertedData.hasOwnProperty(underscoreName)) {
        return { found: true, key: underscoreName, value: convertedData[underscoreName] };
      }
      
      // Try lowercase with underscores
      var lowerUnderscoreName = inputName.toLowerCase().replace(/\s+/g, '_');
      if (convertedData.hasOwnProperty(lowerUnderscoreName)) {
        return { found: true, key: lowerUnderscoreName, value: convertedData[lowerUnderscoreName] };
      }
      
      // Try camelCase variant
      var camelName = inputName.replace(/_([a-z])/g, function(g) { return g[1].toUpperCase(); });
      if (convertedData.hasOwnProperty(camelName)) {
        return { found: true, key: camelName, value: convertedData[camelName] };
      }
      
      // Try case-insensitive search through all keys
      var keys = Object.keys(convertedData);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === lowerName ||
            keys[i].toLowerCase().replace(/\s+/g, '_') === lowerUnderscoreName ||
            keys[i].replace(/\s+/g, '_').toLowerCase() === lowerUnderscoreName) {
          return { found: true, key: keys[i], value: convertedData[keys[i]] };
        }
      }
      
      return { found: false, key: null, value: undefined };
    };

    // Wait for modal to be fully rendered
    modalPromise.rendered.then(function () {
      console.log('Edit modal rendered, populating fields...');
      var populatedCount = 0;
      var skippedCount = 0;
      var missingCount = 0;
      
      $("#edtfrm")
        .find("input, textarea, select")
        .each(function () {
          var rawName = $(this).attr("name") || '';
          if (!rawName) {
            console.warn('Skipping input with no name attribute');
            skippedCount++;
            return;
          }
          
          // Try to find value using multiple key variants
          var result = findValueInData(rawName, convertedData);
          var val = result.value;
          
          if (!result.found) {
            console.warn('Field "' + rawName + '" not found in convertedData. Available keys:', Object.keys(convertedData));
            missingCount++;
          }
          
          // determine effective type from fieldTypeMap or input attribute
          var type = ($scope.fieldTypeMap && ($scope.fieldTypeMap[rawName] || $scope.fieldTypeMap[rawName.toLowerCase()] || $scope.fieldTypeMap[rawName.toLowerCase().replace(/\s+/g, '_')])) || $(this).attr('type') || $(this).prop('tagName').toLowerCase() === 'textarea' ? 'textarea' : $(this).prop('tagName').toLowerCase() === 'select' ? 'select' : 'text';
          
          console.log('Populating field:', rawName, 'Type:', type, 'Value:', val, 'Found as:', result.key);

          // Set value in $scope.edls using the raw input name (the key used in the template)
          if (result.found && typeof val !== 'undefined') {
            $scope.edls[rawName] = val;
          }

          // Data is already converted by convertObjectFields, just set values appropriately
          if (type === 'date' || type === 'datetime-local') {
            // Date fields expect Date objects
            if (val instanceof Date) {
              try {
                if (!$scope.$$phase) {
                  $scope.$apply(function () { $scope.edls[rawName] = val; });
                } else {
                  $scope.edls[rawName] = val;
                }
                $(this).val(''); // Let Angular binding handle it
                populatedCount++;
              } catch (e) {
                $(this).val(val);
                populatedCount++;
              }
            } else if (val) {
              $(this).val(val);
              populatedCount++;
            }
          } else if (type === 'time' || type === 'month' || type === 'week') {
            // Time/month/week fields expect strings
            if (val !== null && typeof val !== 'undefined') {
              $(this).val(val);
              populatedCount++;
              try {
                if (!$scope.$$phase) {
                  $scope.$apply(function () { $scope.edls[rawName] = val; });
                } else {
                  $scope.edls[rawName] = val;
                }
              } catch (e) {
                // ignore
              }
            }
          } else if (type === 'number' || type === 'range') {
            // Number fields expect numbers
            var numVal = (typeof val === 'number') ? val : Number(val);
            if (!isNaN(numVal) && val !== null && val !== '') {
              try {
                if (!$scope.$$phase) {
                  $scope.$apply(function () { $scope.edls[rawName] = numVal; });
                } else {
                  $scope.edls[rawName] = numVal;
                }
                $(this).val(numVal);
                populatedCount++;
              } catch (e) {
                $(this).val(val);
                populatedCount++;
              }
            } else if (val !== null && typeof val !== 'undefined') {
              $(this).val(val);
              populatedCount++;
            }
          } else if (type === 'select') {
            // Select dropdowns
            if (val !== null && typeof val !== 'undefined') {
              $(this).val(val);
              populatedCount++;
            }
          } else if (type === 'textarea') {
            // Textareas
            if (val !== null && typeof val !== 'undefined') {
              $(this).val(val);
              populatedCount++;
            }
          } else {
            // All other fields (text, email, url, etc.) expect strings
            if (val !== null && typeof val !== 'undefined') {
              $(this).val(val);
              populatedCount++;
            }
          }
        });
      
      console.log('Field population complete. Populated:', populatedCount, 'Missing:', missingCount, 'Skipped:', skippedCount);
      
      // Force Angular digest to update any ng-model bindings
      try {
        if (!$scope.$$phase) {
          $scope.$apply();
        }
      } catch (e) {
        console.log('$apply after population (ignore if already in digest):', e.message);
      }
    });

    modalPromise.result
      .then(function (data) {})
      .then(null, function (reason) {
        document.getElementById("mainsection").classList.remove("blurcontent");
      });
  };

  var dmodalPopup = function () {
    document.getElementById("mainsection").classList.add("blurcontent");

    return ($scope.modalInstance = $uibModal.open({
      animation: true,
      templateUrl: "blocks/modal/ddialog.html",
      scope: $scope,
    }));
  };

  $scope.deletectg = function (id) {
    $scope.delcid = id;
    console.log(id);
    dmodalPopup()
      .result.then(function (data) {})
      .then(null, function (reason) {
        document.getElementById("mainsection").classList.remove("blurcontent");
      });
  };

  $scope.deleteproduct = function (id) {
    $scope.delid = id;
    console.log(id);
    dmodalPopup()
      .result.then(function (data) {})
      .then(null, function (reason) {
        document.getElementById("mainsection").classList.remove("blurcontent");
      });
  };

  $scope.delyes = function (id, vx) {
    // Publish CRUD event - workflows will react automatically
    try { 
      const traceId = $scope.publishCrudEvent('delete', { id: id, role: $scope.userdata && $scope.userdata.role }); 
      console.log(`[${traceId}] Delete event published for id: ${id}`);
    } catch (e) { 
      console.warn('publishCrudEvent delete failed', e); 
    }

    var url = $scope.url + "?id=" + id + "&" + vx + "=true";
    // //post req start
    $http({
      method: "GET",
      url: url,
    }).success(function (response) {
      console.log(response);
      window.top.postMessage("success^Deleted Successfully", "*");
      // notie.alert({ type: 'success', text: 'Deleted Successfully', stay: false })
      // alert("Deleted Successfully")
      window.location.reload();
    });
    // //post req ends
  };

  $scope.logout = function () {
    localStorage.removeItem("apikey");
    window.location.href = "index.html";
  };

  $scope.no = function () {
    if ($scope.modalInstance) {
      $scope.modalInstance.dismiss("No Button Clicked");
    }
  };

  $scope.grims = function () {
    var apife = localStorage.getItem("apikey");
    var syr = "http://appsthink.com:1111/getimg/" + apife;
    $http({
      method: "GET",
      url: syr,
    }).success(function (response) {
      console.log(response);
      response.forEach(function (a) {
        a.filename =
          "http://appsthink.com:1111/images/" + apife + "/" + a.filename;
      });
      $scope.imgr = response;
    });
  };

  $scope.allowplugin = function (fieldName, source, event) {
    console.log("==== WEATHER1 ALLOWPLUGIN WITH MAPPING ====");
    console.log("Field (raw key from ng-repeat):", fieldName, "Source:", source);
    console.log("Field type:", typeof fieldName);
    console.log("Click event:", event);
    console.log("Current fieldPluginMap:", $scope.fieldPluginMap);
    
    // Get the clicked element and find the related input
    if (event) {
      const clickedImg = event.currentTarget || event.target;
      console.log("Clicked image element:", clickedImg);
      
      // Find the input field that's a sibling
      const parentDiv = clickedImg.parentElement;
      const inputField = parentDiv ? parentDiv.querySelector('input') : null;
      
      if (inputField) {
        console.log("Found related input field:");
        console.log("  - Name attribute:", inputField.name);
        console.log("  - ID attribute:", inputField.id);
        console.log("  - Value:", inputField.value);
        console.log("  - ng-model:", inputField.getAttribute('ng-model'));
        
        // Use the actual input name attribute as the field name
        fieldName = inputField.name;
        console.log("Using input name as fieldName:", fieldName);
      }
    }
    
    // Basic validation - just ensure we have a fieldName
    if (!fieldName) {
      console.error("ERROR: No fieldName provided");
      return;
    }
    
    // Get plugin data for context
    let pluginDto = source === "addModal" ? localStorage.getItem("addDto") : localStorage.getItem("editDto");
    console.log("pluginDto", pluginDto);
    
    // Store the field name directly - this should be the raw key (e.g., "tile_size")
    localStorage.setItem("activeField", fieldName);
    console.log("SUCCESS: Stored activeField =", fieldName);
    console.log("Stored in localStorage, retrieving to confirm:", localStorage.getItem("activeField"));
    
    // Check if this field has a mapped plugin (try multiple key forms)
    var mappedPlugin = $scope.fieldPluginMap[fieldName];
    if (!mappedPlugin && typeof fieldName === 'string') {
      var lf = fieldName.toLowerCase();
      mappedPlugin = $scope.fieldPluginMap[lf] || $scope.fieldPluginMap[lf.replace(/\s+/g, '_')];
    }
    console.log("Mapped plugin for field '" + fieldName + "' (after normalization):", mappedPlugin);
    
    // Determine the iframe source URL
    var iframeSrc;
    if (mappedPlugin) {
      // Direct plugin mapping exists - open that plugin directly
      iframeSrc = "../plugins/" + encodeURIComponent(mappedPlugin) + "/?source=" + source + "&field=" + encodeURIComponent(fieldName);
      console.log("Using direct plugin mapping:", iframeSrc);
    } else {
      // No mapping - show plugin selector
      iframeSrc = "../plugins/?source=" + source + "&field=" + encodeURIComponent(fieldName);
      console.log("No mapping found, showing plugin selector:", iframeSrc);
    }
    
    // Collect current form data to send to plugin
    var formData = {};
    var fieldTypes = {};
    
    if (source === "addModal" && $scope.addingNew) {
      // For add modal, send all data that has been input by the user so far
      formData = angular.copy($scope.addingNew);
      
      // Include field types for each field
      Object.keys(formData).forEach(function(fieldName) {
        var fieldType = $scope.getFieldType(fieldName);
        fieldTypes[fieldName] = fieldType;
      });
      
      console.log("Sending add modal data to plugin:", formData);
      console.log("Field types for add modal:", fieldTypes);
    } else if (source === "editModal" && $scope.edls) {
      // For edit modal, send all the data from the edit modal
      formData = angular.copy($scope.edls);
      
      // Include field types for each field
      Object.keys(formData).forEach(function(fieldName) {
        var fieldType = $scope.getFieldType(fieldName);
        fieldTypes[fieldName] = fieldType;
      });
      
      console.log("Sending edit modal data to plugin:", formData);
      console.log("Field types for edit modal:", fieldTypes);
    }
    
    // Create plugin sidebar
    console.log("Creating plugin sidebar...");
    
    // First remove any existing plugin elements
    const existingOverlay = document.getElementById("plugin-overlay");
    const existingSidebar = document.getElementById("plugin-sidebar");
    if (existingOverlay) document.body.removeChild(existingOverlay);
    if (existingSidebar) document.body.removeChild(existingSidebar);

    const sidebarHTML = `
        <div id="plugin-overlay" style="position: fixed; top: 0; left: 0; width: 20%; height: 100%; background: rgba(0,0,0,0.3); z-index: 2040; cursor: pointer; opacity: 0; transition: opacity 0.3s ease;"></div>
        <div id="plugin-sidebar" style="position: fixed; top: 0; right: -80%; width: 80%; height: 100%; background: white; z-index: 2050; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: -2px 0 5px rgba(0,0,0,0.2);">
            <div style="padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0;">${mappedPlugin ? mappedPlugin : 'Select Plugin'}</h3>
                <button id="close-plugin" style="border: none; background: none; font-size: 20px; cursor: pointer;width: 40px; height: 40px; border-radius: 50%; background-color: red; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">X</button>
            </div>
            <iframe id="plugin-frame" src="${iframeSrc}" style="width: 100%; height: calc(100% - 60px); border: none;"></iframe>
        </div>
    `;

    // Insert HTML and get references in one go
    document.body.insertAdjacentHTML("beforeend", sidebarHTML);

    const sidebar = document.getElementById("plugin-sidebar");
    const overlay = document.getElementById("plugin-overlay");
    const closeBtn = document.getElementById("close-plugin");

    // Initialize elements and add listeners only after confirming they exist
    if (sidebar && overlay && closeBtn) {
      console.log("Plugin sidebar elements created successfully");
      
      requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        sidebar.style.transform = "translateX(-100%)";
      });

      const messageHandler = function (event) {
        console.log('=== MESSAGE HANDLER FIRED ===');
        console.log('Message received in app.js:', event.data);
        console.log('Event origin:', event.origin);
        
        // Handle different message types
        if (event.data === 'close-plugin') {
          console.log('Received close-plugin message, closing sidebar');
          closeSidebar();
          return;
        }
        
        // Handle URL/file path messages
        if (typeof event.data === "string" && event.data !== 'close-plugin') {
          // Get the field name from the iframe URL, not localStorage
          const pluginFrame = document.getElementById('plugin-frame');
          let activeField = null;
          
          if (pluginFrame && pluginFrame.src) {
            console.log('Plugin frame src (full URL):', pluginFrame.src);
            try {
              const url = new URL(pluginFrame.src);
              activeField = url.searchParams.get('field');
              console.log('Retrieved activeField from iframe URL (raw):', activeField);
              console.log('URL search params (all):', Array.from(url.searchParams.entries()));
            } catch (e) {
              console.error('Error parsing iframe URL:', e);
            }
          } else {
            console.error('Plugin frame not found or has no src');
          }
          
          // Fallback to localStorage if URL parsing fails
          if (!activeField) {
            activeField = localStorage.getItem("activeField");
            console.log('Fallback: Retrieved activeField from localStorage:', activeField);
          }
          
          console.log('=== FIELD IDENTIFICATION ===');
          console.log('Final activeField value:', activeField);
          console.log('activeField length:', activeField ? activeField.length : 0);
          console.log('activeField has spaces?', activeField ? activeField.includes(' ') : 'N/A');
          console.log('activeField has underscores?', activeField ? activeField.includes('_') : 'N/A');
          console.log('Type of activeField:', typeof activeField);
          console.log('Received URL/file data:', event.data);
          
          const formId = source === "addModal" ? "#adtfrm" : (source === "editModal" ? "#edtfrm" : "#adtfrm");
          console.log('Using form ID:', formId);
          console.log('Source value:', source);
          
          // First check if the form exists
          const formElement = document.querySelector(formId);
          console.log('Form element found:', formElement);
          
          if (!formElement) {
            console.error('CRITICAL: Form element not found! Modal may not be open or DOM not ready.');
            return;
          }
          
          // Get all inputs to see what's available
          const allInputs = document.querySelectorAll(`${formId} input[type="text"]`);
          console.log('=== ALL INPUTS IN FORM ===');
          console.log('Total inputs found:', allInputs.length);
          allInputs.forEach((inp, idx) => {
            console.log(`Input ${idx}:`, {
              name: inp.name,
              id: inp.id,
              value: inp.value,
              'name has spaces': inp.name.includes(' '),
              'name has underscores': inp.name.includes('_')
            });
          });
          
          // Try to find the input field
          console.log('=== ATTEMPTING TO FIND INPUT ===');
          console.log('Searching for input with name="' + activeField + '"');
          let inputField = document.querySelector(`${formId} input[name="${activeField}"]`);
          console.log('Direct query result:', inputField);
          
          // If not found, try with exact match (case sensitive)
          if (!inputField) {
            console.log('Input not found with exact name match, trying case-insensitive search...');
            const allInputs = document.querySelectorAll(`${formId} input`);
            console.log('All inputs in form:', Array.from(allInputs).map(inp => ({name: inp.name, id: inp.id})));
            
            // Try case-insensitive name match
            for (let inp of allInputs) {
              if (inp.name && inp.name.toLowerCase() === activeField.toLowerCase()) {
                inputField = inp;
                console.log('Found input with case-insensitive match:', inp.name);
                break;
              }
            }
            
            // If still not found, try to match by converting spaces to underscores (in case field names are transformed)
            if (!inputField) {
              const underscoreField = activeField.replace(/\s+/g, '_').toLowerCase();
              console.log('Trying underscore version:', underscoreField);
              for (let inp of allInputs) {
                if (inp.name && inp.name.toLowerCase() === underscoreField) {
                  inputField = inp;
                  console.log('Found input with underscore match:', inp.name);
                  break;
                }
              }
            }
            
            // Last resort: try to find any input that might be related
            if (!inputField && allInputs.length > 0) {
              console.log('No exact match found, trying to find any input that might be the target...');
              // Look for inputs that don't have empty names
              const namedInputs = Array.from(allInputs).filter(inp => inp.name && inp.name.trim());
              if (namedInputs.length === 1) {
                inputField = namedInputs[0];
                console.log('Using the only named input found:', inputField.name);
              } else if (namedInputs.length > 1) {
                console.log('Multiple named inputs found, cannot determine which one to use');
              }
            }
          }
          
          console.log('Looking for input with name:', activeField);
          console.log('Input field found:', inputField);
          
          if (inputField) {
            inputField.value = event.data;
            console.log('SUCCESS: Set input value to:', event.data);
            
            // For Angular binding, also update the ng-model if it exists
            if (source === "addModal" && $scope.addingNew) {
              $scope.addingNew[activeField] = event.data;
              console.log('Updated addingNew model for field:', activeField);
              console.log('addingNew object after update:', $scope.addingNew);
            } else if (source === "editModal" && $scope.edls) {
              $scope.edls[activeField] = event.data;
              console.log('Updated edls model for field:', activeField);
              console.log('edls object after update:', $scope.edls);
            }
            
            // Trigger Angular digest cycle to update the model
            try {
              $scope.$apply();
              console.log('Angular $apply executed successfully');
            } catch (e) {
              console.log('$apply error (likely already in digest):', e.message);
              // If already in digest cycle, just continue
            }
            
            // Close the plugin sidebar after successful update
            console.log('Scheduling sidebar close in 1 second...');
            setTimeout(() => {
              closeSidebar();
            }, 1000);
            
          } else {
            console.error('Could not find input field for activeField:', activeField);
            // Log all available inputs for debugging
            const allInputs = document.querySelectorAll(`${formId} input`);
            console.log('Available inputs:', Array.from(allInputs).map(inp => ({name: inp.name, type: inp.type, value: inp.value})));
          }
        }
      };

      const closeSidebar = () => {
        console.log("Closing plugin sidebar");
        overlay.style.opacity = "0";
        sidebar.style.transform = "translateX(0)";
        setTimeout(() => {
          if (document.body.contains(sidebar)) document.body.removeChild(sidebar);
          if (document.body.contains(overlay)) document.body.removeChild(overlay);
          window.removeEventListener("message", messageHandler);
        }, 300);
      };

      overlay.addEventListener("click", closeSidebar);
      closeBtn.addEventListener("click", closeSidebar);
      window.addEventListener("message", messageHandler);
      
      // Send form data to plugin when iframe loads
      const pluginFrame = document.getElementById('plugin-frame');
      if (pluginFrame) {
        pluginFrame.onload = function() {
          console.log('Plugin iframe loaded, sending form data...');
          try {
            // Send the form data and field types to the plugin
            pluginFrame.contentWindow.postMessage({
              type: 'form-data',
              source: source,
              fieldName: fieldName,
              formData: formData,
              fieldTypes: fieldTypes
            }, '*');
            console.log('Sent form data to plugin:', {
              type: 'form-data',
              source: source,
              fieldName: fieldName,
              formData: formData,
              fieldTypes: fieldTypes
            });
          } catch (e) {
            console.error('Error sending form data to plugin:', e);
          }
        };
      }
      
      console.log("Plugin sidebar setup complete");
    } else {
      console.error("Failed to create plugin sidebar elements");
    }
  };
});