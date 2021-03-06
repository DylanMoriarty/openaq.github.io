'use strict';

var Reflux = require('reflux');
var nets = require('nets');
var _ = require('lodash');
var async = require('async');

var utils = require('../utils');
var actions = require('../actions/actions');
var config = require('../config');

var LocationsStore = Reflux.createStore({

  storage: {
    totalNumber: 0,
    countries: []
  },

  init: function () {
    this.getSites();
  },

  prettifyCountries: function () {
    this.storage.countries = _.map(this.storage.countries, function (c) {
      c.prettyCountry = utils.getPrettyCountry(c.country);

      return c;
    });
  },

  // Put into a standard order and give them pretty names
  prettifyParams: function (params) {
    // Sort
    var order = ['pm25', 'pm10', 'co', 'so2', 'no2', 'o3', 'bc'];
    params = _.sortBy(params, function (p) {
      return _.indexOf(order, p);
    });

    // Nice names
    params = _.map(params, function (p) {
      switch (p) {
        case 'pm25':
          return 'PM2.5';
        default:
          return p.toUpperCase();
      }
    });

    return params;
  },

  getSites: function () {
    var self = this;

    var handleResults = function (data) {
      // Roll up the locations into countries
      var countries = groupResults(data.results);

      self.storage.countries = countries;

      // Get total number of measurements
      self.storage.countries.forEach(function (l) {
        self.storage.totalNumber += l.count;
      });

      // Make the parameter names nicer
      _.map(self.storage.countries, function (c) {
        return _.map(c.cities, function (ci) {
          return _.map(ci.locations, function (l) {
            l.parameters = self.prettifyParams(l.parameters);
            return l;
          });
        });
      });

      // Make the country names nicer
      self.prettifyCountries();

      // And sort by nice country name
      self.storage.countries = _.sortBy(self.storage.countries, 'prettyCountry');

      // Done, send out action
      actions.latestLocationsLoaded();
    };

    var createGetFunction = function (limit, page) {
      return function (done) {
        return nets({ url: config.apiURL + 'locations?limit=' + limit + '&page=' + page }, function (err, res, body) {
          if (err) {
            return done(err);
          }

          var data;
          try {
            data = JSON.parse(body);
          } catch (e) {
            return done(e);
          }

          return done(null, data.results);
        });
      };
    };

    nets({ url: config.apiURL + 'locations?limit=0' }, function (err, res, body) {
      if (err) {
        return console.error(err);
      }

      var data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        return console.error(e);
      }

      // Run extra fetch tasks to get all pages of data
      var tasks = [];
      var limit = 1000;
      for (var i = 1; i <= Math.ceil(data.meta.found / limit); i++) {
        var f = createGetFunction(limit, i);
        tasks.push(f);
      }

      async.parallel(tasks, function (err, results) {
        if (err) {
          return console.error(err);
        }

        // Join all results
        results.forEach(function (r) {
          data.results = data.results.concat(r);
        });

        // Handle the joined results
        handleResults(data);
      });
    });
  }

});

/**
* This is a big ugly function to group the results from the api into something
* nicer for display.
*
* @param {Array} locations - The locations from the api
*/
var groupResults = function (locations) {
  var grouped = {};
  _.forEach(locations, function (d) {
    var location = {
      location: d.location,
      count: d.count,
      firstUpdated: d.firstUpdated,
      lastUpdated: d.lastUpdated,
      parameters: d.parameters,
      sourceName: d.sourceName
    };
    var country = grouped[d.country];
    if (country) {
      // Country exists already
      var city = country.cities[d.city];
      if (city) {
        // City exists already, add location and update parent values
        city.locations.push(location);
        city.count += location.count;
        country.count += location.count;
        city.firstUpdated = (location.firstUpdated < city.firstUpdated) ? location.firstUpdated : city.firstUpdated;
        country.firstUpdated = (location.firstUpdated < country.firstUpdated) ? location.firstUpdated : country.firstUpdated;
        city.lastUpdated = (location.lastUpdated > city.lastUpdated) ? location.lastUpdated : city.lastUpdated;
        country.lastUpdated = (location.lastUpdated > country.lastUpdated) ? location.lastUpdated : country.lastUpdated;
        city.parameters = _.union(city.parameters, location.parameters);
        country.parameters = _.union(country.parameters, location.parameters);
      } else {
        // City doesn't exist yet
        country.cities[d.city] = {
          city: d.city,
          locations: [location],
          count: location.count,
          firstUpdated: location.firstUpdated,
          lastUpdated: location.lastUpdated,
          parameters: location.parameters
        };
        // And update country count
        country.count += location.count;
      }
    } else {
      // Neither Country nor City exist yet
      grouped[d.country] = {
        country: d.country,
        cities: {},
        count: location.count,
        firstUpdated: location.firstUpdated,
        lastUpdated: location.lastUpdated,
        parameters: location.parameters
      };
      grouped[d.country].cities[d.city] = {
        city: d.city,
        locations: [location],
        count: location.count,
        firstUpdated: location.firstUpdated,
        lastUpdated: location.lastUpdated,
        parameters: location.parameters
      };
    }
  });

  // Turn the object into an array for output
  var final = [];
  _.forEach(grouped, function (g) {
    var finalCities = [];
    _.forEach(g.cities, function (c) {
      finalCities.push(c);
    });
    g.cities = finalCities;
    final.push(g);
  });

  return final;
};

module.exports = LocationsStore;
