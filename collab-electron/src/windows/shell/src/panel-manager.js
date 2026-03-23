/**
 * Panel resize, nav visibility, and preference persistence.
 */

function getPanelConstraints(side) {
	const s = getComputedStyle(document.documentElement);
	const min = parseInt(
		s.getPropertyValue(`--panel-${side}-min`).trim(), 10,
	);
	const max = parseInt(
		s.getPropertyValue(`--panel-${side}-max`).trim(), 10,
	);
	return { min, max };
}

export function createPanelManager({
	panelNav, panelViewer, navResizeHandle, navToggle,
	getAllWebviews, onNavVisibilityChanged,
}) {
	let navVisible = true;
	const _prefCache = {};

	function savePanelPref(key, value) {
		_prefCache[key] = value;
		window.shellApi.setPref(key, value);
	}

	function loadPanelPref(key) {
		const value = _prefCache[key];
		if (value == null) return null;
		return value;
	}

	function savePanelVisible(panel, visible) {
		_prefCache[`panel-visible-${panel}`] = visible;
		window.shellApi.setPref(`panel-visible-${panel}`, visible);
	}

	function loadPanelVisible(panel, fallback) {
		const value = _prefCache[`panel-visible-${panel}`];
		if (value == null) return fallback;
		return !!value;
	}

	function updateTogglePositions() {
		const panelsEl = document.getElementById("panels");
		const panelsRect = panelsEl.getBoundingClientRect();
		const centerY = panelsRect.top + panelsRect.height / 2;

		if (navVisible) {
			const navRect = panelNav.getBoundingClientRect();
			navToggle.style.left = `${navRect.right + 8}px`;
		} else {
			navToggle.style.left = `${panelsRect.left + 8}px`;
		}
		navToggle.style.top = `${centerY}px`;
		navToggle.style.transform = "translateY(-50%)";
	}

	function applyNavVisibility() {
		if (navVisible) {
			panelNav.style.display = "";
			navResizeHandle.style.display = "";
			const stored = loadPanelPref("panel-width-nav");
			const px = stored != null && stored > 1 ? stored : 280;
			panelNav.style.flex = `0 0 ${px}px`;
			panelViewer.style.flex = "1 1 0";
		} else {
			panelNav.style.display = "none";
			navResizeHandle.style.display = "none";
			panelViewer.style.flex = "";
		}
		navToggle.setAttribute(
			"aria-pressed", String(navVisible),
		);
		navToggle.setAttribute(
			"aria-label",
			navVisible ? "Hide Navigator" : "Show Navigator",
		);
		navToggle.title =
			navVisible ? "Hide Navigator" : "Show Navigator";
		onNavVisibilityChanged(navVisible);
		updateTogglePositions();
	}

	function setupResize(onResize) {
		const resizeOverlay =
			document.getElementById("resize-overlay");

		navResizeHandle.addEventListener("mousedown", (e) => {
			e.preventDefault();
			const startX = e.clientX;
			const startWidth =
				panelNav.getBoundingClientRect().width;
			const startCounterWidth =
				panelViewer.getBoundingClientRect().width;
			let prevClamped = startWidth;

			navResizeHandle.classList.add("active");
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			resizeOverlay.style.display = "block";

			for (const h of getAllWebviews()) {
				h.webview.style.pointerEvents = "none";
			}

			function onMouseMove(e) {
				const constraints = getPanelConstraints("nav");
				const delta = e.clientX - startX;
				const unclamped = startWidth + delta;
				const clamped = Math.max(
					constraints.min,
					Math.min(constraints.max, unclamped),
				);
				const counterDelta = prevClamped - clamped;
				prevClamped = clamped;
				panelNav.style.flex = `0 0 ${clamped}px`;
				panelViewer.style.flex = "1 1 0";
				onResize(counterDelta);
			}

			function onMouseUp() {
				navResizeHandle.classList.remove("active");
				document.removeEventListener(
					"mousemove", onMouseMove,
				);
				document.removeEventListener(
					"mouseup", onMouseUp,
				);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
				resizeOverlay.style.display = "";

				for (const h of getAllWebviews()) {
					h.webview.style.pointerEvents = "";
				}

				savePanelPref(
					"panel-width-nav",
					panelNav.getBoundingClientRect().width,
				);
			}

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}

	function initPrefs(prefNavWidth, prefNavVisible) {
		if (prefNavWidth != null) {
			_prefCache["panel-width-nav"] = prefNavWidth;
		}
		if (prefNavVisible != null) {
			_prefCache["panel-visible-nav"] = prefNavVisible;
		}
		navVisible = loadPanelVisible("nav", true);
	}

	return {
		applyNavVisibility,
		isNavVisible() { return navVisible; },
		toggleNav() {
			navVisible = !navVisible;
			savePanelVisible("nav", navVisible);
			applyNavVisibility();
		},
		setNavVisible(visible) {
			navVisible = visible;
			savePanelVisible("nav", navVisible);
			applyNavVisibility();
		},
		updateTogglePositions,
		setupResize,
		savePanelPref,
		loadPanelPref,
		loadPanelVisible,
		initPrefs,
	};
}
