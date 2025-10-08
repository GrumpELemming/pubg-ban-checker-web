// duplicate-load guard
if(window.__UI_LOADED__){console.warn('UI loaded twice')}else{window.__UI_LOADED__=true;
/* =======================================================
   Red13 — Crate Screen Layout (v0.95 Stable, visible fix)
   ======================================================= */
#crates {
  position: absolute;
  inset: 0;
  background: #000 url('../assets/crate_bg.png') center/cover no-repeat;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.crate-options {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.crate-card {
  cursor: pointer;
  display: grid;
  gap: 10px;
  padding: 20px 26px;
  border-radius: 18px;
  background: rgba(15, 20, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  transition: transform 0.15s ease, border-color 0.2s ease, background 0.2s ease;
  width: 260px;
  color: #fff;
}

.crate-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(20, 26, 36, 0.96);
}

.crate-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.crate-thumb {
  width: 70px;
  height: 70px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.crate-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.crate-name {
  font-weight: 800;
  color: #fff;
  font-size: 1.05rem;
}

.crate-cost {
  font-size: 13px;
  color: #bbb;
  margin-top: 4px;
}

.cost-good {
  color: #36d399;
  font-weight: 700;
}

.crate-buttons {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}

#crateImg {
  position: absolute;
  width: 180px;
  left: 50%;
  transform: translateX(-50%);
  top: -300px;
  z-index: 60;
  transition: top 0.2s ease;
}

}// end guard
