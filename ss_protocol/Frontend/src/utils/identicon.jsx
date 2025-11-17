import blockies from 'ethereum-blockies-base64';

/**
 * Generate an identicon (MetaMask-style) for an Ethereum address
 * @param {string} address - Ethereum address
 * @param {number} size - Size of the icon (default: 8)
 * @returns {string} Base64 data URL for the identicon
 */
export const generateIdenticon = (address, size = 8) => {
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    // Return a default placeholder for zero address
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="10" fill="%23999"/%3E%3Ctext x="12" y="16" font-size="12" text-anchor="middle" fill="%23fff"%3E?%3C/text%3E%3C/svg%3E';
  }

  try {
    return blockies(address);
  } catch (error) {
    console.error('Error generating identicon:', error);
    // Return fallback SVG
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="10" fill="%23999"/%3E%3Ctext x="12" y="16" font-size="12" text-anchor="middle" fill="%23fff"%3E?%3C/text%3E%3C/svg%3E';
  }
};

/**
 * Component to display identicon as an image
 */
export const Identicon = ({ address, size = 40, className = '', style = {} }) => {
  const iconSrc = generateIdenticon(address);
  
  return (
    <img
      src={iconSrc}
      alt={`Identicon for ${address}`}
      width={size}
      height={size}
      className={className}
      style={{
        borderRadius: '50%',
        ...style
      }}
    />
  );
};

export default { generateIdenticon, Identicon };
