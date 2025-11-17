import { useEffect } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import "../Styles/WalletConnector.css";

const WalletConnector = () => {
  const { isConnected, address } = useAppKitAccount();

  useEffect(() => {
    console.log("Wallet connected:", isConnected, "Address:", address);
  }, [isConnected, address]);

  return (
    <div>
      <appkit-button></appkit-button>
    </div>
  );
};

export default WalletConnector;