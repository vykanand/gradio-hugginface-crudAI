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

                // Merge defaults into existing addingNew (do not overwrite user input)
                if (!$scope.addingNew || Object.keys($scope.addingNew).length === 0) {
                  $scope.addingNew = addObj;
                } else {
                  Object.keys(addObj).forEach(function(k){ try { if (typeof $scope.addingNew[k] === 'undefined') $scope.addingNew[k] = addObj[k]; } catch(e){} });
                }
              } catch (e) {
                console.error('Error building addingNew object from getfirstcontent', e);
                $scope.addingNew = {};
              }

              console.log("after building addingNew", $scope.addingNew);
              try { $scope._ensureModuleFieldConfigs(Object.keys($scope.addingNew || {})); } catch(e) {}
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
                // Merge defaults into existing addingNew (do not overwrite user input)
                if (!$scope.addingNew || Object.keys($scope.addingNew).length === 0) {
                  $scope.addingNew = addObj2;
                } else {
                  Object.keys(addObj2).forEach(function(k){ try { if (typeof $scope.addingNew[k] === 'undefined') $scope.addingNew[k] = addObj2[k]; } catch(e){} });
                }
              } catch (e) {
                console.error('Error building addingNew object (nodata branch)', e);
                $scope.addingNew = {};
              }

              console.log("addingnew when no data found", $scope.addingNew);
              try { $scope._ensureModuleFieldConfigs(Object.keys($scope.addingNew || {})); } catch(e) {}
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

    // Wait for modal to be rendered, then use a MutationObserver + delegated handlers for robustness
    modalPromise.rendered.then(function () {
      try {
        var $frm = $("#adtfrm");
        // Ensure initial configs and listener registration
        try { $scope._ensureModuleFieldConfigs(Object.keys($scope.addingNew || {})); } catch(e) {}
        try { $scope.registerModuleEventListeners(); } catch(e) {}

        // Delegated handlers on form container (faster than per-control binds)
        try {
          $frm.off('.fieldEvents');
          $frm.on('input.fieldEvents change.fieldEvents', 'input,select,textarea', function(){
            var $el = $(this);
            var rawName = $el.attr('name') || '';
            if (!rawName) return;
            try {
              var val;
              if ($el.is(':checkbox')) { val = $scope.addingNew && $scope.addingNew[rawName]; }
              else if ($el.is(':radio')) { val = $scope.addingNew && $scope.addingNew[rawName] || $el.val(); }
              else { val = $el.val(); }
              try { if (!$scope.$$phase) { $scope.$apply(); } } catch(e) {}
            } catch(e) {}
          });

          // focusin/focusout bubble — use to detect focus change
          $frm.on('focusin.fieldEvents', 'input,select,textarea', function(){
            try {
              var rawName = $(this).attr('name') || '';
              if (!rawName) return;
              if ($scope._lastFocusedAdd && $scope._lastFocusedAdd !== rawName) {
                $scope._flushFieldChange('add', $scope._lastFocusedAdd);
              }
              $scope._lastFocusedAdd = rawName;
            } catch(e){}
          });

          $frm.on('focusout.fieldEvents', 'input,select,textarea', function(){
            try {
              var rawName = $(this).attr('name') || '';
              if (!rawName) return;
              try { $scope.$apply(function(){ $scope._flushFieldChange('add', rawName); }); } catch(e){ try { $scope._flushFieldChange('add', rawName); } catch(e2){} }
              if ($scope._lastFocusedAdd === rawName) $scope._lastFocusedAdd = null;
            } catch(e){}
          });
        } catch(e) { console.warn('attach delegated add handlers failed', e); }

        // Process existing controls (set numeric defaults) and hide loader
        var processAddControls = function() {
          try {
            var $controls = $frm.find('input,select,textarea');
            $controls.each(function () {
              var rawName = $(this).attr('name') || '';
              var fieldName = rawName.toLowerCase().replace(/ /g, "_");
              var type = ($scope.fieldTypeMap && ($scope.fieldTypeMap[rawName] || $scope.fieldTypeMap[rawName.toLowerCase()] || $scope.fieldTypeMap[fieldName])) || $(this).attr('type') || 'text';
              if (type === 'number' || type === 'range') {
                try {
                  if (!$scope.addingNew) $scope.addingNew = {};
                  // Only initialize numeric defaults when the model key is undefined or an empty string
                  var cur = $scope.addingNew[rawName];
                  if (typeof cur === 'undefined' || cur === '') {
                    // only coerce if there's a usable default value
                    var val = cur;
                    if (typeof val !== 'undefined' && val !== null && val !== '') {
                      var numVal = Number(val);
                      if (!isNaN(numVal)) {
                        try { if (!$scope.$$phase) { $scope.$apply(function () { $scope.addingNew[rawName] = numVal; }); } else { $scope.addingNew[rawName] = numVal; } } catch(e){}
                      }
                    }
                  }
                } catch(e){}
              }
            });
            try { $('.loadmodal, .loading').hide(); } catch(e){}
          } catch(e) { /* ignore */ }
        };

        // Initial process
        processAddControls();

        // MutationObserver to react to ng-repeat/DOM insertions and dynamic column changes
        try {
          if (window.MutationObserver) {
            var addObserver = new MutationObserver(function(mutations) {
              // whenever children change, re-run control processing and ensure configs
              processAddControls();
              try { $scope._ensureModuleFieldConfigs(Object.keys($scope.addingNew || {})); } catch(e){}
              try { $scope.registerModuleEventListeners(); } catch(e){}
            });
            addObserver.observe($frm[0], { childList: true, subtree: true });
            $scope._addModalObserver = addObserver;
          }
        } catch(e) { /* ignore */ }
      } catch(e) { console.warn('add modal rendered handler error', e); }
    });

    modalPromise.result
      .then(function (data) {})
      .then(null, function (reason) {
        try { Object.keys($scope._pendingFieldChanges.add||{}).forEach(function(k){ try{$scope._flushFieldChange('add',k);}catch(e){} }); } catch(e) {}
        // disconnect observer if any
        try { if ($scope._addModalObserver) { $scope._addModalObserver.disconnect(); delete $scope._addModalObserver; } } catch(e) {}
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
    // flush any queued add-field changes before collecting data
    try { Object.keys($scope._pendingFieldChanges && $scope._pendingFieldChanges.add || {}).forEach(function(nk){ try{$scope._flushFieldChange('add', nk);}catch(e){} }); } catch(e){}
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

    //post req start
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
        // dispatch only the 'add' module action and per-field add events
        try {
          var mod = ($scope.moduleEvents && $scope.moduleEvents.module) ? $scope.moduleEvents.module.toString() : (localStorage.getItem('headinfo') || 'module');
          var addAction = ($scope.moduleEvents.actions || []).find(function(x){ return x && x.key === 'add'; });
          if (addAction && addAction.event) $scope.dispatchModuleEvent(addAction.event, { response: response, module: mod });
          ($scope.moduleEvents.fields || []).forEach(function(f){ if (!f) return; if (f.addEvent) $scope.dispatchModuleEvent(f.addEvent, { field: f.name, module: mod }); });
        } catch(e) { console.warn('emit add events error', e); }
        window.top.postMessage("success^Created Successfully", "*");
        // window.location.reload(); // temporarily disabled for in-page debugging
      })
      .catch(function onError(response) {
        window.top.postMessage("error^Some Error Occured", "*");
        // window.location.reload(); // temporarily disabled for in-page debugging
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
        try {
          var mod = ($scope.moduleEvents && $scope.moduleEvents.module) ? $scope.moduleEvents.module.toString() : (localStorage.getItem('headinfo') || 'module');
          var updAction = ($scope.moduleEvents.actions || []).find(function(x){ return x && x.key === 'update'; });
          if (updAction && updAction.event) $scope.dispatchModuleEvent(updAction.event, { response: response, module: mod });
          var prevStored = {};
          try { prevStored = JSON.parse(localStorage.getItem('editDto') || '{}'); } catch(e) { prevStored = {}; }
          ($scope.moduleEvents.fields || []).forEach(function(f){
            if (!f) return;
            if (!f.editEvent) return;
            var prevVal = prevStored.hasOwnProperty(f.name) ? prevStored[f.name] : (prevStored[$scope._normalizeFieldKey(f.name)] || null);
            var newVal = ($scope.edls && typeof $scope.edls[f.name] !== 'undefined') ? $scope.edls[f.name] : null;
            $scope.dispatchModuleEvent(f.editEvent, { field: f.name, prev: prevVal, value: newVal, module: mod });
          });
        } catch(e) { console.warn('emit edit events error', e); }
        // notie.alert({ type: 'success', text: 'Edited Successfully', stay: false })
        // window.location.reload(); // temporarily disabled for in-page debugging
      })
      .catch(function onError(response) {
        // alert('Some error occured');
        window.top.postMessage("error^Some Error Occured", "*");
        // notie.alert({ type: 'error', text: 'Some error occured', stay: false })
        // window.location.reload(); // temporarily disabled for in-page debugging
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
    try { $scope._ensureModuleFieldConfigs(Object.keys($scope.edls || {})); } catch(e) {}
    localStorage.setItem("editDto", JSON.stringify($scope.edls));
    $scope.edtid = convertedData.id;

    // Open modal first
    var modalPromise = emodalPopup();

    // Wait for modal to be fully rendered and attach delegated handlers + observer
    modalPromise.rendered.then(function () {
      try {
        var $frm = $("#edtfrm");
        // set values for existing controls
        try {
          var $controls = $frm.find('input,select,textarea');
          $controls.each(function () {
            var rawName = $(this).attr('name') || '';
            var fieldName = rawName.toLowerCase().replace(/ /g, "_");
            var val = convertedData[fieldName];
            var type = ($scope.fieldTypeMap && ($scope.fieldTypeMap[rawName] || $scope.fieldTypeMap[rawName.toLowerCase()] || $scope.fieldTypeMap[fieldName])) || $(this).attr('type') || 'text';
            if (type === 'date' || type === 'datetime-local') {
              if (val instanceof Date) {
                try { if (!$scope.$$phase) { $scope.$apply(function () { $scope.edls[rawName] = val; }); } else { $scope.edls[rawName] = val; } } catch(e){ $(this).val(val); }
              } else { $(this).val(typeof val === 'undefined' ? '' : val); }
            } else if (type === 'time' || type === 'month' || type === 'week') {
              $(this).val(typeof val === 'undefined' ? '' : val);
              try { if (!$scope.$$phase) { $scope.$apply(function () { $scope.edls[rawName] = val; }); } else { $scope.edls[rawName] = val; } } catch(e){}
            } else if (type === 'number' || type === 'range') {
              var numVal = (typeof val === 'number') ? val : Number(val);
              if (!isNaN(numVal) && val !== null && val !== '') {
                try { if (!$scope.$$phase) { $scope.$apply(function () { $scope.edls[rawName] = numVal; }); } else { $scope.edls[rawName] = numVal; } } catch(e){ $(this).val(val); }
              } else { $(this).val(typeof val === 'undefined' ? '' : val); }
            } else { $(this).val(typeof val === 'undefined' ? '' : val); }
          });
        } catch(e) { /* ignore */ }

        // Ensure configs and listeners
        try { $scope._ensureModuleFieldConfigs(Object.keys($scope.edls || {})); } catch(e) {}
        try { $scope.registerModuleEventListeners(); } catch(e) {}

        // Delegated handlers on edit form
        try {
          $frm.off('.fieldEvents');
          $frm.on('input.fieldEvents change.fieldEvents', 'input,select,textarea', function(){
            var $el = $(this);
            var rawName = $el.attr('name') || '';
            if (!rawName) return;
            try {
              var val;
              if ($el.is(':checkbox')) { val = $scope.edls && $scope.edls[rawName]; }
              else if ($el.is(':radio')) { val = $scope.edls && $scope.edls[rawName] || $el.val(); }
              else { val = $el.val(); }
              try { $scope.$apply(function(){ $scope._queueFieldChange('edit', rawName, val, ($scope._lastFieldValues.edit && $scope._lastFieldValues.edit[rawName]) || null); }); } catch(e){ $scope._queueFieldChange('edit', rawName, val, ($scope._lastFieldValues.edit && $scope._lastFieldValues.edit[rawName]) || null); }
            } catch(e) {}
          });

          $frm.on('focusin.fieldEvents', 'input,select,textarea', function(){
            try {
              var rawName = $(this).attr('name') || '';
              if (!rawName) return;
              if ($scope._lastFocusedEdit && $scope._lastFocusedEdit !== rawName) {
                $scope._flushFieldChange('edit', $scope._lastFocusedEdit);
              }
              $scope._lastFocusedEdit = rawName;
            } catch(e){}
          });

          $frm.on('focusout.fieldEvents', 'input,select,textarea', function(){
            try {
              var rawName = $(this).attr('name') || '';
              if (!rawName) return;
              try { $scope.$apply(function(){ $scope._flushFieldChange('edit', rawName); }); } catch(e){ try { $scope._flushFieldChange('edit', rawName); } catch(e2){} }
              if ($scope._lastFocusedEdit === rawName) $scope._lastFocusedEdit = null;
            } catch(e){}
          });
        } catch(e) { console.warn('attach delegated edit handlers failed', e); }

        // MutationObserver to handle dynamic changes in edit form as well
        try {
          if (window.MutationObserver) {
            var editObserver = new MutationObserver(function() {
              try { $scope._ensureModuleFieldConfigs(Object.keys($scope.edls || {})); } catch(e){}
              try { $scope.registerModuleEventListeners(); } catch(e){}
            });
            editObserver.observe($frm[0], { childList: true, subtree: true });
            $scope._editModalObserver = editObserver;
          }
        } catch(e) {}
      } catch(e) { console.warn('edit modal rendered handler error', e); }
    });

    modalPromise.result
      .then(function (data) {})
      .then(null, function (reason) {
        try { Object.keys($scope._pendingFieldChanges.edit||{}).forEach(function(k){ try{$scope._flushFieldChange('edit',k);}catch(e){} }); } catch(e) {}
        try { if ($scope._editModalObserver) { $scope._editModalObserver.disconnect(); delete $scope._editModalObserver; } } catch(e) {}
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
    var url = $scope.url + "?id=" + id + "&" + vx + "=true";
    // //post req start
    $http({ method: "GET", url: url }).success(function (response) {
      console.log(response);
      try {
        var mod = ($scope.moduleEvents && $scope.moduleEvents.module) ? $scope.moduleEvents.module.toString() : (localStorage.getItem('headinfo') || 'module');
        var delAction = ($scope.moduleEvents.actions || []).find(function(x){ return x && x.key === 'delete'; });
        if (delAction && delAction.event) $scope.dispatchModuleEvent(delAction.event, { response: response, module: mod, deletedId: id });
      } catch(e) { console.warn('emit delete events error', e); }
      window.top.postMessage("success^Deleted Successfully", "*");
      // window.location.reload(); // temporarily disabled for in-page debugging
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

  // Settings modal functions - global on scope
    $scope._normalizeFieldKey = function(name) {
      if (!name) return '';
      return name.toString().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    };

    $scope._dedupeModuleFields = function() {
      try {
        var seen = {};
        var uniq = [];
        ($scope.moduleEvents.fields || []).forEach(function(f){
          var k = $scope._normalizeFieldKey(f.name);
          if (!k) return;
          if (!seen[k]) { seen[k]=true; uniq.push(f); }
          else {
            var existing = uniq.find(function(x){ return $scope._normalizeFieldKey(x.name) === k; });
            if (existing) {
              existing.addEvent = existing.addEvent || f.addEvent;
              existing.editEvent = existing.editEvent || f.editEvent;
              existing.deleteEvent = existing.deleteEvent || f.deleteEvent;
            }
          }
        });
        $scope.moduleEvents.fields = uniq;
      } catch (e) { console.warn('dedupe error', e); }
    };

    // find field config by normalized key in a structured object
    $scope._findFieldConfig = function(structured, key) {
      try {
        if (!structured || !structured.fields) return null;
        var nk = $scope._normalizeFieldKey(key);
        var found = null;
        Object.keys(structured.fields).forEach(function(fk){ if (found) return; if ($scope._normalizeFieldKey(fk) === nk) found = { name: fk, cfg: structured.fields[fk] }; });
        return found;
      } catch(e){ return null; }
    };

  $scope._normalizeFieldKey = function(name) {
    if (!name) return '';
    return name.toString().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  };

  $scope._dedupeModuleFields = function() {
    try {
      var seen = {};
      var uniq = [];
      ($scope.moduleEvents.fields || []).forEach(function(f){
        var k = $scope._normalizeFieldKey(f.name);
        if (!k) return;
        if (!seen[k]) { seen[k]=true; uniq.push(f); }
        else {
          // merge non-empty values into existing entry
          var existing = uniq.find(function(x){ return $scope._normalizeFieldKey(x.name) === k; });
          if (existing) {
            existing.addEvent = existing.addEvent || f.addEvent;
            existing.editEvent = existing.editEvent || f.editEvent;
            existing.deleteEvent = existing.deleteEvent || f.deleteEvent;
          }
        }
      });
      $scope.moduleEvents.fields = uniq;
    } catch (e) { console.warn('dedupe error', e); }
  };

    // Ensure moduleEvents.fields contains configs for given raw field keys
    $scope._ensureModuleFieldConfigs = function(keys) {
      try {
        if (!Array.isArray(keys)) return;
        $scope.moduleEvents = $scope.moduleEvents || { module: (localStorage.getItem('headinfo')||'module'), actions: [], fields: [] };
        var mod = ($scope.moduleEvents.module) ? $scope.moduleEvents.module.toString() : (localStorage.getItem('headinfo') || 'module');
        keys.forEach(function(k){
          if (!k) return;
          // skip system fields
          if (['id','role','created_at','updated_at'].indexOf(k) !== -1) return;
          var nk = $scope._normalizeFieldKey(k);
          var exists = ($scope.moduleEvents.fields || []).some(function(f){ return $scope._normalizeFieldKey(f.name) === nk; });
          if (!exists) {
            var base = mod + ':field:' + nk;
            ($scope.moduleEvents.fields = $scope.moduleEvents.fields || []).push({
              name: k,
              addEvent: base + ':added',
              editEvent: base + ':edited',
              deleteEvent: base + ':deleted'
            });
          }
        });
        $scope._dedupeModuleFields();
        try { $scope.registerModuleEventListeners(); } catch(e) { /* ignore */ }
      } catch(e) { console.warn('ensure field configs error', e); }
    };

    // pending per-field changes captured by watchers until blur/flush
    $scope._pendingFieldChanges = { add: {}, edit: {} };
    // No auto-flush timers: rely on focus-change and blur handlers to flush.
    $scope._queueFieldChange = function(lifecycle, key, value, prev) {
      try {
        if (!key || (typeof key === 'string' && (key.indexOf('$$') === 0 || key[0] === '$'))) return;
        lifecycle = lifecycle === 'edit' ? 'edit' : 'add';
        $scope._pendingFieldChanges = $scope._pendingFieldChanges || { add: {}, edit: {} };
        $scope._pendingFieldChanges[lifecycle] = $scope._pendingFieldChanges[lifecycle] || {};
        var nk = $scope._normalizeFieldKey(key);
        if (!nk) return;
        $scope._pendingFieldChanges[lifecycle][nk] = { value: value, previous: prev, raw: key };
        try { console.debug('QUEUED FIELD CHANGE', lifecycle, key, nk, value); } catch(e) {}
      } catch(e) { console.warn('queueFieldChange error', e); }
    };

    $scope._flushFieldChange = function(lifecycle, key) {
      try {
        lifecycle = lifecycle === 'edit' ? 'edit' : 'add';
        if (!key) return;
        var nk = $scope._normalizeFieldKey(key);
        if (!nk) return;
        try { console.debug('FLUSH attempt', lifecycle, key, nk); } catch(e) {}
        var pending = $scope._pendingFieldChanges && $scope._pendingFieldChanges[lifecycle] && $scope._pendingFieldChanges[lifecycle][nk];
        if (!pending) { try { console.debug('FLUSH no pending for', nk); } catch(e) {} ; return; }
        var rawKey = pending.raw || key;
        try { console.debug('FLUSHING', lifecycle, rawKey, pending); } catch(e) {}
        $scope._emitFieldChange(lifecycle, rawKey, pending.value, pending.previous);
        delete $scope._pendingFieldChanges[lifecycle][nk];
      } catch(e) { console.warn('flushFieldChange error', e); }
    };

  // Module event listener registry
  $scope._moduleEventListeners = {};
  $scope.registerModuleEventListeners = function() {
    try {
      // remove old listeners
      Object.keys($scope._moduleEventListeners).forEach(function(ev){ window.removeEventListener(ev, $scope._moduleEventListeners[ev]); });
      $scope._moduleEventListeners = {};

      var register = function(eventName){
        if (!eventName) return;
        var listenerName = eventName + '-listener';
        if ($scope._moduleEventListeners[listenerName]) return;
        var cb = function(e){
          console.log('====EVENT RECEIVED====', listenerName, e && e.detail ? e.detail : null);
          try { window.top.postMessage('orchestrator_event^' + listenerName + '^' + JSON.stringify(e && e.detail ? e.detail : {}), '*'); } catch(err){ console.warn('postMessage failed', err); }
          try { if (!$scope.$$phase) $scope.$apply(); } catch(e){}
        };
        window.addEventListener(listenerName, cb);
        $scope._moduleEventListeners[listenerName] = cb;
        console.log('====EVENT LISTENER REGISTERED====', listenerName);
      };

      // register for general actions
      ($scope.moduleEvents.actions || []).forEach(function(a){ if (a && a.event) register(a.event); });
      // register per-field events
      ($scope.moduleEvents.fields || []).forEach(function(f){ if (!f) return; [f.addEvent, f.editEvent, f.deleteEvent].forEach(register); });
      console.log('Registered module event listeners', Object.keys($scope._moduleEventListeners));
    } catch(e){ console.warn('registerModuleEventListeners error', e); }
  };

  // Debounced dispatcher for module events
  $scope._pendingDispatch = {};
  $scope.dispatchModuleEvent = function(eventName, detail, delay) {
    try {
      if (!eventName) return;
      delay = typeof delay === 'number' ? delay : 300;
      if ($scope._pendingDispatch[eventName]) clearTimeout($scope._pendingDispatch[eventName]);
      console.log('====EVENT SCHEDULED====', eventName, detail || {});
      $scope._pendingDispatch[eventName] = setTimeout(function(){
        try {
          console.log('====EVENT FIRED====', eventName, detail || {});
          window.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} }));
          try {
            var listenerName = eventName + '-listener';
            console.log('====EVENT FIRED==== (listener variant) ', listenerName, detail || {});
            window.dispatchEvent(new CustomEvent(listenerName, { detail: detail || {} }));
          } catch(e2) { }
        } catch(e){
          console.warn('dispatch failed', e);
        }
        delete $scope._pendingDispatch[eventName];
      }, delay);
    } catch(e){ console.warn('dispatchModuleEvent error', e); }
  };

  // Initialize module events with defaults and register listeners (no persistence)
  $scope.initializeModuleEvents = function() {
    try {
      var defaultModule = (localStorage.getItem('headinfo') || 'module').toString().toLowerCase();
      $scope.moduleEvents = { module: defaultModule, actions: [], fields: [] };
      $scope.moduleEvents.actions = [
        { key: 'add', label: 'Add Record', event: defaultModule + ':add' },
        { key: 'update', label: 'Update Record', event: defaultModule + ':update' },
        { key: 'delete', label: 'Delete Record', event: defaultModule + ':delete' }
      ];
      var names = [];
      if ($scope.addingNew && Object.keys($scope.addingNew).length > 0) names = Object.keys($scope.addingNew);
      else if ($scope.edls && Object.keys($scope.edls).length > 0) names = Object.keys($scope.edls);
      else if ($scope.rawFields && $scope.rawFields.length > 0) names = $scope.rawFields;
      $scope.moduleEvents.fields = [];
      (names || []).forEach(function(fn){
        if (!fn) return; if (['id','role','created_at','updated_at'].indexOf(fn) !== -1) return;
        var safe = fn.toString();
        $scope.moduleEvents.fields.push({ name: safe, addEvent: defaultModule + ':field:' + safe + ':added', editEvent: defaultModule + ':field:' + safe + ':edited', deleteEvent: defaultModule + ':field:' + safe + ':deleted' });
      });
      $scope._dedupeModuleFields();
      $scope.registerModuleEventListeners();
    } catch(e){ console.warn('initializeModuleEvents error', e); }
  };

  // Settings UI removed: provide safe no-op save/cancel functions
  $scope.cancelSettings = function () { try { if ($scope.settingsModal) $scope.settingsModal.dismiss('cancel'); document.getElementById('mainsection').classList.remove('blurcontent'); } catch(e){} };
  $scope.saveModuleEvents = function () { try { console.log('saveModuleEvents called but persistence is disabled; listeners re-registered'); $scope._dedupeModuleFields(); $scope.registerModuleEventListeners(); } catch(e){} };

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

  // Initialize module events on controller load (no persistence)
  // Preload dynamic fields for Add modal as early as possible to avoid ng-repeat delay
  $scope._preloadAddFields = function() {
    try {
      var role = ($scope.userdata && $scope.userdata.role) ? $scope.userdata.role : (localStorage.getItem('userdat') ? (JSON.parse(localStorage.getItem('userdat')).role) : ($scope.userole || ''));
      $http.get($scope.url + "?getfirstcontent=true&role=" + role)
        .success(function(data) {
          try {
            var addObj = {};
            if (Array.isArray(data)) {
              data.forEach(function (col) {
                var colLower = col.toLowerCase();
                var colUnderscore = colLower.replace(/ /g, '_');
                var fieldType = ($scope.fieldTypeMap && ($scope.fieldTypeMap[col] || $scope.fieldTypeMap[colLower] || $scope.fieldTypeMap[colUnderscore])) || 'text';
                if (fieldType === 'number' || fieldType === 'range') addObj[col] = 0; else addObj[col] = '';
              });
            } else if (typeof data === 'object' && data !== null) {
              Object.keys(data).forEach(function(col) {
                var colLower = col.toLowerCase();
                var colUnderscore = colLower.replace(/ /g, '_');
                var fieldType = ($scope.fieldTypeMap && ($scope.fieldTypeMap[col] || $scope.fieldTypeMap[colLower] || $scope.fieldTypeMap[colUnderscore])) || 'text';
                if (fieldType === 'number' || fieldType === 'range') addObj[col] = 0; else addObj[col] = '';
              });
            }
            delete addObj.id; delete addObj.role; delete addObj.created_at; delete addObj.updated_at;
            // Merge defaults into existing `addingNew` without overwriting any user-entered values
            if (!$scope.addingNew || Object.keys($scope.addingNew).length === 0) {
              $scope.addingNew = addObj;
            } else {
              Object.keys(addObj).forEach(function(k){
                try {
                  if (typeof $scope.addingNew[k] === 'undefined') {
                    $scope.addingNew[k] = addObj[k];
                  }
                } catch(e){}
              });
            }
            // also set rawFields if not present
            try { if ((!$scope.rawFields || $scope.rawFields.length===0) && Array.isArray(data)) $scope.rawFields = data.slice(); } catch(e){}
            try { $scope._ensureModuleFieldConfigs(Object.keys($scope.addingNew || {})); } catch(e){}
            try { $scope.registerModuleEventListeners(); } catch(e){}
            // hide loader element if present
            try { $('.loadmodal, .loading').hide(); } catch(e){}
            $scope._preloadDone = true;
          } catch(e) { console.warn('preloadAddFields build error', e); }
        })
        .error(function(){ /* ignore preload errors */ });
    } catch(e) { console.warn('preloadAddFields error', e); }
  };

  try { $scope._preloadAddFields(); } catch(e){}

  try { $scope.initializeModuleEvents(); } catch(e) { console.warn('initializeModuleEvents call failed', e); }

  // Watch for per-field changes in Add and Edit forms and emit field lifecycle events
  $scope._lastFieldValues = { add: {}, edit: {} };
  $scope._emitFieldChange = function(lifecycle, key, value, prev) {
    try {
      if (!key) return;
      var mod = ($scope.moduleEvents && $scope.moduleEvents.module) ? $scope.moduleEvents.module : (localStorage.getItem('headinfo') || 'module');
      var structured = { module: mod, actions: {}, fields: {} };
      if ($scope.moduleEvents && $scope.moduleEvents.fields) {
        ($scope.moduleEvents.fields || []).forEach(function(f){ if (!f || !f.name) return; structured.fields[f.name] = { addEvent: f.addEvent, editEvent: f.editEvent, deleteEvent: f.deleteEvent }; });
      }
      var found = $scope._findFieldConfig(structured, key) || null;
      if (!found) {
        var norm = $scope._normalizeFieldKey(key);
        found = ($scope.moduleEvents.fields || []).find(function(f){ return $scope._normalizeFieldKey(f.name) === norm; }) || null;
      }
      if (!found || !found.cfg) return;
      var ev = null;
      if (lifecycle === 'add') ev = found.cfg.addEvent;
      else if (lifecycle === 'edit') ev = found.cfg.editEvent;
      if (!ev) return;
      // if prev not provided, try to use tracked last value
      try {
        $scope._lastFieldValues = $scope._lastFieldValues || { add: {}, edit: {} };
        var trackedPrev = (prev === undefined || prev === null) ? ($scope._lastFieldValues[lifecycle] ? $scope._lastFieldValues[lifecycle][found.name] : undefined) : prev;
        $scope.dispatchModuleEvent(ev, { field: found.name, module: mod, value: value, previous: trackedPrev }, 300);
        // update last seen value after dispatch
        try { $scope._lastFieldValues[lifecycle][found.name] = value; } catch(e){}
      } catch(e) { console.warn('emitFieldChange dispatch error', e); }
    } catch(e){ console.warn('emitFieldChange error', e); }
  };

  $scope.$watch('addingNew', function(newV, oldV) {
    try {
      if (!newV || typeof newV !== 'object') return;
      oldV = oldV || {};
      Object.keys(newV).forEach(function(k){
        var nv = newV[k];
        var ov = oldV[k];
        var changed = false;
        try { changed = JSON.stringify(nv) !== JSON.stringify(ov); } catch(e){ changed = nv !== ov; }
        if (changed) {
          $scope._queueFieldChange('add', k, nv, ov);
        }
      });
    } catch(e){ }
  }, true);

  $scope.$watch('edls', function(newV, oldV) {
    try {
      if (!newV || typeof newV !== 'object') return;
      oldV = oldV || {};
      Object.keys(newV).forEach(function(k){
        var nv = newV[k];
        var ov = oldV[k];
        var changed = false;
        try { changed = JSON.stringify(nv) !== JSON.stringify(ov); } catch(e){ changed = nv !== ov; }
        if (changed) {
          $scope._queueFieldChange('edit', k, nv, ov);
        }
      });
    } catch(e){ }
  }, true);
});