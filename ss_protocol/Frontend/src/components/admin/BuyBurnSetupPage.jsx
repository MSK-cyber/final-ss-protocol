import React, { useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { ethers } from "ethers";

export default function BuyBurnSetupPage() {
  const { BuyAndBurnController } = useContractContext();
  const [activeStep, setActiveStep] = useState(2);
  const [loading, setLoading] = useState(false);

  // Step 2: Setup SWAP vault allowance on controller (governance-only)
  const [allowanceAmount, setAllowanceAmount] = useState("");

  // Step 3: Create Buy & Burn Pool (STATE from SWAP vault, WPLS from governance)
  const [poolData, setPoolData] = useState({
    stateAmount: "",
    wplsAmount: "",
    plsToWrap: "", // optional msg.value to wrap inside controller
  });

  const handleSetupAllowance = async (e) => {
    e.preventDefault();
    if (!BuyAndBurnController) return alert("BuyAndBurnController not available");
    let amountWei;
    try {
      amountWei = ethers.parseEther(allowanceAmount || "0");
      if (amountWei <= 0n) throw new Error("Amount must be > 0");
    } catch {
      return alert("Invalid allowance amount");
    }

    setLoading(true);
    try {
      const tx = await BuyAndBurnController.setupSwapVaultAllowance(amountWei);
      console.log("Allowance tx:", tx.hash);
      alert(`Allowance tx sent: ${tx.hash}`);
      await tx.wait();
      alert("Swap vault allowance set on controller");
      setActiveStep(3);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to set allowance");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePool = async (e) => {
    e.preventDefault();
    if (!BuyAndBurnController) return alert("BuyAndBurnController not available");

    let stateWei, wplsWei, plsWei;
    try {
      stateWei = ethers.parseEther(poolData.stateAmount || "0");
      wplsWei = ethers.parseEther(poolData.wplsAmount || "0");
      plsWei = ethers.parseEther(poolData.plsToWrap || "0");
      if (stateWei <= 0n || (wplsWei <= 0n && plsWei <= 0n)) {
        return alert("Provide STATE amount and either WPLS or PLS to wrap");
      }
    } catch {
      return alert("Invalid amount format");
    }

    setLoading(true);
    try {
      const tx = await BuyAndBurnController.createPoolOneClick(stateWei, wplsWei, {
        value: plsWei,
      });
      console.log("Create pool tx:", tx.hash);
      alert(`Create pool tx sent: ${tx.hash}`);
      await tx.wait();
      alert("STATE/WPLS pool created and LP burned");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create pool");
    } finally {
      setLoading(false);
    }
  };

  // Governance Action: Convert any PLS held by controller to WPLS
  const handleConvertPLSToWPLS = async () => {
    if (!BuyAndBurnController) return alert("BuyAndBurnController not available");
    setLoading(true);
    try {
      const tx = await BuyAndBurnController.convertPLSToWPLS();
      console.log("Convert PLS->WPLS tx:", tx.hash);
      alert(`Convert tx sent: ${tx.hash}`);
      await tx.wait();
      alert("Converted all available PLS to WPLS");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to convert PLS to WPLS");
    } finally {
      setLoading(false);
    }
  };

  // Governance Action: Execute optimal buy & burn
  const handleExecuteBuyAndBurn = async () => {
    if (!BuyAndBurnController) return alert("BuyAndBurnController not available");
    setLoading(true);
    try {
      const tx = await BuyAndBurnController.executeBuyAndBurn();
      console.log("Execute Buy & Burn tx:", tx.hash);
      alert(`Buy & Burn tx sent: ${tx.hash}`);
      await tx.wait();
      alert("Buy & Burn executed successfully");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to execute Buy & Burn");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">💰 Steps 2 & 3: Buy & Burn Setup</h5>
        <small className="text-muted">Set SWAP vault allowance and create STATE/WPLS pool</small>
      </div>
      <div className="card-body">
        {/* Step Navigation */}
        <div className="row g-2 mb-4">
          <div className="col-6">
            <button
              className={`btn w-100 ${activeStep === 2 ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setActiveStep(2)}
            >
              Step 2: Setup Allowance
            </button>
          </div>
          <div className="col-6">
            <button
              className={`btn w-100 ${activeStep === 3 ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setActiveStep(3)}
            >
              Step 3: Create Pool
            </button>
          </div>
        </div>

        {/* Step 2 Content */}
        {activeStep === 2 && (
          <form onSubmit={handleSetupAllowance}>
            <h6 className="text-primary mb-3">🔧 Step 2: Allow Controller to pull STATE from SWAP vault</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">STATE Allowance Amount</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={allowanceAmount}
                  onChange={(e) => setAllowanceAmount(e.target.value)}
                  placeholder="5000.0"
                  required
                />
                <small className="text-muted">This sets SWAP vault allowance for the controller</small>
              </div>
            </div>
            <div className="mt-4">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Setting Allowance...
                  </>
                ) : (
                  "Setup Swap Vault Allowance"
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 3 Content */}
        {activeStep === 3 && (
          <form onSubmit={handleCreatePool}>
            <h6 className="text-primary mb-3">🏊 Step 3: Create Buy & Burn Pool</h6>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">STATE Amount (from SWAP vault)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.stateAmount}
                  onChange={(e) => setPoolData((p) => ({ ...p, stateAmount: e.target.value }))}
                  placeholder="5000.0"
                  required
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">WPLS Amount (from governance)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.wplsAmount}
                  onChange={(e) => setPoolData((p) => ({ ...p, wplsAmount: e.target.value }))}
                  placeholder="1000.0"
                />
                <small className="text-muted">Optional if sending PLS to wrap below</small>
              </div>
              <div className="col-md-4">
                <label className="form-label">PLS to Wrap (msg.value)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.plsToWrap}
                  onChange={(e) => setPoolData((p) => ({ ...p, plsToWrap: e.target.value }))}
                  placeholder="1000.0"
                />
                <small className="text-muted">Optional: controller wraps PLS into WPLS</small>
              </div>
            </div>
            <div className="mt-4">
              <button type="submit" className="btn btn-success" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Creating Pool...
                  </>
                ) : (
                  "Create Buy & Burn Pool"
                )}
              </button>
            </div>
            <hr className="my-4" />
            <div className="row g-2">
              <div className="col-md-6">
                <button
                  type="button"
                  className="btn w-100 btn-outline-warning"
                  onClick={handleConvertPLSToWPLS}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Converting PLS to WPLS...
                    </>
                  ) : (
                    "Convert PLS → WPLS"
                  )}
                </button>
              </div>
              <div className="col-md-6">
                <button
                  type="button"
                  className="btn w-100 btn-outline-danger"
                  onClick={handleExecuteBuyAndBurn}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Executing Buy & Burn...
                    </>
                  ) : (
                    "Execute Buy & Burn"
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}