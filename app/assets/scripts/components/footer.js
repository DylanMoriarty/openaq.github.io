var React = require('react');
var ReactIntl = require('react-intl');
var Reflux = require('reflux');

var locationsStore = require('../stores/locations');
var actions = require('../actions/actions');

var IntlMixin = ReactIntl.IntlMixin;
var FormattedMessage = ReactIntl.FormattedMessage;

var Footer = React.createClass({

  mixins: [
    IntlMixin,
    Reflux.listenTo(actions.latestLocationsLoaded, 'onLatestLocationsLoaded')
  ],

  propTypes: {
    style: React.PropTypes.string
  },

  getInitialState: function () {
    return {
      numMeasurements: locationsStore.storage.totalNumber || 0
    };
  },

  onLatestLocationsLoaded: function () {
    this.setState({
      numMeasurements: locationsStore.storage.totalNumber
    });
  },

  render: function () {
    return (
      <footer id='site-footer' className={this.props.style}>
        <div className='inner'>
          <p>
            <FormattedMessage
              message={this.getIntlMessage('footer')}
              number={this.state.numMeasurements}
              heart={<span className='heart'>♥</span>}
              link={<a href='http://developmentseed.com/' title='Visit Development Seed website'>Development Seed</a>}
              email={<a href='mailto:info@openaq.org?subject=Mail from website' title='Email OpenAQ'>OpenAQ</a>} />
          </p>
        </div>
      </footer>
    );
  }
});

module.exports = Footer;
