import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import "./Styles/styles.css";
import { useEffect, useState } from "react";
import Header from "./components/Header";
import InfoCards from "./components/InfoCards";
import DataTable from "./components/DataTable";
import DetailsInfo from "./components/DetailsInfo";
import AuctionBoxes from "./components/Auction/AuctionBoxes";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Footer from "./components/Footer";
import DavHistory from "./components/DavHistory";
import SwapComponent from "./components/Swap/SwapModel";
import AdminLayout from "./components/admin/AdminLayout";

const App = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <Router>
      <div className="d-flex flex-column min-vh-100">
        <Header />
        <Toaster position="bottom-left" reverseOrder={false} />
        <div>
          {!isOnline && (
            <div
              className="alert alert-danger text-center w-100 position-fixed top-0 start-0"
              style={{ zIndex: 1050, padding: "15px", fontSize: "18px" }}
              role="alert"
            >
              ⚠️ You are offline. Some features may not work properly.
            </div>
          )}
          {/* Main content area */}
          <main className="flex-grow-1">
            <Routes>
              <Route path="/" element={<Navigate to="/auction" />} />
              {/* DEX page removed from header; route kept temporarily for backward compatibility */}
              {/* <Route path="/Swap" element={<><SwapComponent /></>} /> */}
              <Route
                path="/auction"
                element={
                  <>
                    <InfoCards />
                    <AuctionBoxes />
                    <DataTable />
                  </>
                }
              />
              <Route
                path="/Deflation"
                element={<Navigate to="/auction" replace />}
              />
              {/* Legacy AddToken routes redirected to Admin Tokens */}
              <Route path="/ADDToken" element={<Navigate to="/admin/tokens" replace />} />
              <Route path="/AddToken" element={<Navigate to="/admin/tokens" replace />} />
              <Route
                path="/info"
                element={
                  <>
                    <DetailsInfo />
                  </>
                }
              />
              <Route
                path="/dav-history"
                element={
                  <>
                    <DavHistory />
                  </>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <>
                    <AdminLayout />
                  </>
                }
              />
            </Routes>
          </main>
        </div>
        <Footer />
      </div>
    </Router>
  );
};

export default App;
