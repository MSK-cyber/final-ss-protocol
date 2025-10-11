import { useLocation } from "react-router-dom";
import AuctionSection from "./Cards/AuctionSection";
import AddTokenSection from "./Cards/AddTokenSection";


const InfoCards = () => {
  const location = useLocation();
  const isAuction = location.pathname === "/auction";
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