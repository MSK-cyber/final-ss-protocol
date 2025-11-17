import { useLocation } from "react-router-dom";
import AuctionSection from "./Cards/AuctionSection";
import AddTokenSection from "./Cards/AddTokenSection";


const InfoCards = () => {
  const location = useLocation();
  // Treat both legacy "/auction" and new "/davpage" as the main DAV Mint page
  const isAuction = location.pathname === "/auction" || location.pathname === "/davpage";
  const isAddToken = location.pathname === "/AddToken";

  return (
    <>
      {isAuction ? (
        <AuctionSection />
      ) : isAddToken ? (
        <AddTokenSection />
      ) : (
        <></>
      )}
    </>
  );
};

export default InfoCards;