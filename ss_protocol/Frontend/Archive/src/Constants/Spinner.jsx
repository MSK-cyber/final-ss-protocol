import PropTypes from "prop-types";

const IOSpinner = ({ className }) => (
  <span
    className={`ios-spinner ${className}`}
    role="status"
    aria-hidden="true"
  ></span>
);

IOSpinner.propTypes = {
  className: PropTypes.string,
};

IOSpinner.defaultProps = {
  className: "",
};

export default IOSpinner;
