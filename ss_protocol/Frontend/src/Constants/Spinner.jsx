import PropTypes from "prop-types";

const IOSpinner = ({ className = "" }) => (
  <span
    className={`ios-spinner ${className}`}
    role="status"
    aria-hidden="true"
  ></span>
);

IOSpinner.propTypes = {
  className: PropTypes.string,
};

// defaultProps avoided; using default parameter instead

export default IOSpinner;
