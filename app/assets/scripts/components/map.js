'use strict';
import React from 'react';
import { render } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import _ from 'lodash';
import moment from 'moment';
import distance from 'turf-distance';
import { colorScale as colors, parameterMax,
         parameterConversion, unusedColor, circleOpacity, circleBlur,
         coloredCircleRadius, unusedCircleRadius, borderCircleRadius, selectCircleRadius, selectShadowCircleRadius } from '../utils/map-settings';
import { generateColorStops } from '../utils/color-scale';
// import  from '../utils/color-scale';

import config from '../config';
mapboxgl.accessToken = config.mapbox.token;

const MapComponent = React.createClass({
  displayName: 'MapComponent',

  propTypes: {
    measurements: React.PropTypes.array,
    highlightLoc: React.PropTypes.string,
    parameter: React.PropTypes.object,
    center: React.PropTypes.array,
    zoom: React.PropTypes.number,
    disableScrollZoom: React.PropTypes.bool,
    children: React.PropTypes.object
  },

  nearbyKm: 10,

  // The map element.
  map: null,

  popover: null,

  nearbyLocationClick: function (location, e) {
    e.preventDefault();
    let data = _.find(this.props.measurements, {location: location});
    this.map.panTo([data.coordinates.longitude, data.coordinates.latitude]);
    this.showPopover(data);
  },

  showPopover: function (data) {
    let measurement = _.find(data.measurements, {parameter: this.props.parameter.id});

    // Find the nearby ones.
    let start = {
      'type': 'Feature',
      'geometry': {
        'type': 'Point',
        'coordinates': [
          data.coordinates.longitude,
          data.coordinates.latitude
        ]
      }
    };

    let nearby = _(_.cloneDeep(this.props.measurements))
      .map(o => {
        let end = {
          'type': 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': [
              o.coordinates.longitude,
              o.coordinates.latitude
            ]
          }
        };
        o.distance = distance(start, end, 'kilometers');
        return o;
      })
      .sortBy('distance')
      .filter(o => o.distance !== 0 && o.distance <= this.nearbyKm)
      .take(2)
      .value();

    let popoverContent = document.createElement('div');
    render(<MapPopover
      location={data.location}
      measurement={measurement}
      parameter={this.props.parameter}
      nearbyKm={this.nearbyKm}
      nearby={nearby}
      nearbyClick={this.nearbyLocationClick} />, popoverContent);

    // Populate the popup and set its coordinates
    // based on the feature found.
    if (this.popover != null) {
      this.popover.remove();
    }

    this.popover = new mapboxgl.Popup({closeButton: false})
      .setLngLat([data.coordinates.longitude, data.coordinates.latitude])
      .setDOMContent(popoverContent)
      .addTo(this.map);
  },

  // Creates highlight for selected points
  setupMapSelect: function () {
    this.map.on('click', (e) => {
      let features = this.map.queryRenderedFeatures(e.point, { layers: ['measurements'] });
      if (!features.length) {
        return;
      }
      if (typeof this.map.getLayer('selectedPoint' || 'selectedPointShadow' || 'selectedPointHighlight') !== 'undefined') {
        this.map.removeLayer('selectedPointShadow');
        this.map.removeLayer('selectedPointHighlight');
        this.map.removeLayer('selectedPoint');
        this.map.removeSource('selectedPoint');
      }
      var feature = features[0];

      this.map.addSource('selectedPoint', {
        'type': 'geojson',
        'data': feature.toJSON()
      });
      // Add Shadow
      this.map.addLayer({
        'id': 'selectedPointShadow',
        'type': 'circle',
        'source': 'selectedPoint',
        'paint': {
          'circle-color': '#000',
          'circle-opacity': 0.2,
          'circle-radius': selectShadowCircleRadius,
          'circle-blur': 0.5,
          'circle-translate': [0.5, 0.5]
        }
      });
      // Add Highlight
      this.map.addLayer({
        'id': 'selectedPointHighlight',
        'type': 'circle',
        'source': 'selectedPoint',
        'paint': {
          'circle-color': '#fff',
          'circle-opacity': 1,
          'circle-radius': selectCircleRadius,
          'circle-blur': 0
        }
      });
      // Re-add fill by value
      this.map.addLayer({
        'id': 'selectedPoint',
        'type': 'circle',
        'source': 'selectedPoint',
        'paint': {
          'circle-color': {
            property: 'convertedValue',
            stops: generateColorStops(this.props.parameter.id)
            // replace with generateColorStops()
          },
          'circle-opacity': 1,
          'circle-radius': coloredCircleRadius,
          'circle-blur': 0
        }
      });
    });
  },

  setupMapPopover: function () {
    // When a click event occurs near a place, open a popup at the location of
    // the feature, with description HTML from its properties.
    this.map.on('click', (e) => {
      let features = this.map.queryRenderedFeatures(e.point, { layers: ['measurements'] });

      if (!features.length) {
        return;
      }

      let data = _.find(this.props.measurements, {location: features[0].properties.location});
      this.showPopover(data);
    });

    // Use the same approach as above to indicate that the symbols are clickable
    // by changing the cursor style to 'pointer'.
    this.map.on('mousemove', (e) => {
      let features = this.map.queryRenderedFeatures(e.point, { layers: ['measurements'] });
      this.map.getCanvas().style.cursor = (features.length) ? 'pointer' : '';
    });
  },

  setupMapData: function () {

    const source = {
      'type': 'geojson',
      'data': {
        type: 'FeatureCollection',
        features: this.props.measurements.map(o => ({
          type: 'Feature',
          properties: {
            location: o.location,
            // Controls which color is applied to the point. Needs to be the points measurement.
            value: o.measurements[3]
          },
          geometry: {
            type: 'Point',
            coordinates: [
              o.coordinates.longitude,
              o.coordinates.latitude
            ]
          }
        }))
      }
    };

    // OLD CODE for converting the value above.
    // latestStore.storage.hasGeo[this.state.selectedParameter].forEach((l) => {
    //   // Handle conversion from ug/m3 to ppm for certain parameters here
    //   l.convertedValue = l.value;
    //   if (['co', 'so2', 'no2', 'o3'].indexOf(l.parameter) !== -1) {
    //     l.convertedValue = parameterConversion[l.parameter] * l.value;
    //   }

    // console.log(this.props.measurements.map(o => ({ o })))

    this.map.addSource('measurements', source);

    // Layer for outline
    this.map.addLayer({
      'id': 'pointOutlines',
      'source': 'measurements',
      'type': 'circle',
      'paint': {
        'circle-color': '#1e4280',
        'circle-opacity': 1,
        'circle-radius': borderCircleRadius,
        'circle-blur': 0
      }
    });

    this.map.addLayer({
      'id': 'measurements',
      'source': 'measurements',
      'type': 'circle',
      'paint': {
        'circle-color': {
          property: 'value',
          stops: generateColorStops(this.props.parameter.id)
        },
        'circle-opacity': circleOpacity,
        'circle-radius': coloredCircleRadius,
        'circle-blur': circleBlur
      }
    });
  },

  componentDidMount: function () {
    this.map = new mapboxgl.Map({
      container: this.refs.map,
      center: this.props.center,
      zoom: this.props.zoom,
      style: config.mapbox.baseStyle
    });

    if (this.props.disableScrollZoom) {
      this.map.scrollZoom.disable();
      this.map.addControl(new mapboxgl.Navigation());
    }

    this.map.on('load', () => {
      this.setupMapData();
      this.setupMapPopover();
      this.setupMapSelect();
    });
  },

  render: function () {
    console.log('this.props.highlightLoc:', this.props.highlightLoc);
    return (
      <div className='map'>
        <div className='map__container' ref='map'>
          {/* Map renders on componentDidMount. */}
        </div>
        <div className='map__legend'>
          {this.props.children}
        </div>
      </div>
    );
  }
});

module.exports = MapComponent;

const MapPopover = React.createClass({
  displayName: 'MapPopover',

  propTypes: {
    location: React.PropTypes.string,
    measurement: React.PropTypes.object,
    parameter: React.PropTypes.object,
    nearbyKm: React.PropTypes.number,
    nearby: React.PropTypes.array,
    nearbyClick: React.PropTypes.func
  },

  renderNearby: function () {
    if (!this.props.nearby.length) {
      return <p>There are no locations within {this.props.nearbyKm}Km</p>;
    }

    return (
      <div>
        <p>Showing <strong>{this.props.nearby.length}</strong> other locations within {this.props.nearbyKm}km</p>
        <ul className='popover-nearby-loc'>
          {this.props.nearby.map(o => {
            let measurement = _.find(o.measurements, {parameter: this.props.parameter.id});
            return (
              <li key={o.location}>
                {measurement
                  ? <strong>{measurement.value} {measurement.unit}</strong>
                  : <strong>{this.props.parameter.name} N/A</strong>}
                <a onClick={this.props.nearbyClick.bind(null, o.location)} href='' title={`Open ${o.location} popover`}>{o.location}</a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },

  render: function () {
    let m = this.props.measurement;
    let reading = <p>{this.props.parameter.name} N/A</p>;
    if (m) {
      let lastUp = moment.utc(m.lastUpdated).format('YYYY/MM/DD HH:mm');
      reading = <p>Last reading <strong>{m.value}{m.unit}</strong> at <strong>{lastUp}</strong></p>;
    }

    return (
      <article className='popover'>
        <div className='popover__contents'>
          <header className='popover__header'>
            <h1 className='popover__title'><a href={`#/location/${this.props.location}`} title={`View ${this.props.location} page`}>{this.props.location}</a></h1>
          </header>
          <div className='popover__body'>
            {reading}
            <ul className='popover__actions'>
              <li><a href={``} className='button button--primary-bounded' title={`Compare ${this.props.location} with another location`}>Compare</a></li>
              <li><a href={`#/location/${this.props.location}`} title={`View ${this.props.location} page`}className='button button--primary-bounded'>View More</a></li>
            </ul>
          </div>
          <footer className='popover__footer'>
            {this.renderNearby()}
          </footer>
        </div>
      </article>
    );
  }
});
