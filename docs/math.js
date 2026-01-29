// --- MATH CORE & PHYSICS ---

const d2r = d => d * Math.PI / 180;
const r2d = r => r * 180 / Math.PI;

function getDeclination(doy) {
	return 23.45 * Math.sin(d2r(360 / 365 * (doy - 81)));
}

function getEquationOfTime(doy) {
	const b = d2r(360 / 364 * (doy - 81));
	return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/**
 * Returns the shift in HOURS to add to Solar Time to get Clock Time.
 * ClockTime = SolarTime + Shift
 *
 * Shift includes:
 * 1. Equation of Time (EOT)
 * 2. Longitude correction (4 min per degree difference from Meridian)
 *
 * @param {number} doy - Day of Year
 * @param {number} lon - Observer Longitude (East is positive)
 * @param {number} utcOffset - Timezone Offset in Hours (e.g. +2.0)
 */
function getTimeCorrection(doy, lon, utcOffset) {
	const eotMin = getEquationOfTime(doy);
	const stdMeridian = utcOffset * 15;
	const lonDiff = stdMeridian - lon; // Positive if West of meridian
	// solar = clock + 4*(lon - mer) + eot
	// clock = solar - 4*(lon - mer) - eot
	// shift = -4*(lon - mer) - eot
	// But let's stick to standard: SolarTime - ClockTime = EOT + 4*(Lon - StdMeridian)
	// So ClockTime = SolarTime - (EOT + 4*(Lon - StdMeridian))

	const timeShiftMin = -(eotMin + 4 * (lon - stdMeridian));
	return timeShiftMin / 60;
}

function getSolarPos(lat, doy, hour) {
	const dec = getDeclination(doy);
	const ha = 15 * (hour - 12);
	const sinEl = Math.sin(d2r(lat)) * Math.sin(d2r(dec)) +
		Math.cos(d2r(lat)) * Math.cos(d2r(dec)) * Math.cos(d2r(ha));
	const el = r2d(Math.asin(sinEl));
	const y = -Math.sin(d2r(ha));
	const x = Math.tan(d2r(dec)) * Math.cos(d2r(lat)) - Math.sin(d2r(lat)) * Math.cos(d2r(ha));
	let az = r2d(Math.atan2(y, x));
	az = (az + 360) % 360;
	return { el, az };
}

function getVector(az, el) {
	const z = Math.sin(d2r(el));
	const hyp = Math.cos(d2r(el));
	const x = hyp * Math.sin(d2r(az));
	const y = hyp * Math.cos(d2r(az));
	return { x, y, z };
}

function getPanelNormal(az, tilt) {
	const z = Math.cos(d2r(tilt));
	const hyp = Math.sin(d2r(tilt));
	const x = hyp * Math.sin(d2r(az));
	const y = hyp * Math.cos(d2r(az));
	return { x, y, z };
}

function dot(v1, v2) {
	return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

/**
 * Helper: Calculate energy for a given orientation (used for baseline)
 */
function calculateEnergyForOrientation(lat, doy, az, tilt, sFrom, sTo) {
	const step = 0.2;
	const panelNorm = getPanelNormal(az, tilt);
	let sum = 0;

	for (let h = 4; h <= 22; h += step) {
		const sun = getSolarPos(lat, doy, h);
		if (sun.el <= 0) continue;

		const sunV = getVector(sun.az, sun.el);
		const intensity = Math.pow(sunV.z, 0.3);
		const dp = Math.max(0, dot(sunV, panelNorm));

		let blocked = false;
		if (sFrom < sTo && h >= sFrom && h <= sTo) blocked = true;

		if (!blocked) {
			sum += dp * intensity;
		}
	}

	return sum * step; // Energy factor
}

// Cache for optimal baseline energies (key: "lat_doy")
const baselineCache = {};

/**
 * Get optimal baseline energy (cached)
 */
function getOptimalBaseline(lat, doy) {
	// Round to 1 decimal for cache key (matches UI precision)
	const key = `${lat.toFixed(1)}_${doy}`;

	if (baselineCache[key] !== undefined) {
		return baselineCache[key];
	}

	// Phase 1: Coarse grid search
	let bestEnergy = 0;
	let bestAz = 180;
	let bestTilt = 30;

	for (let a = 90; a <= 270; a += 10) {
		for (let t = 0; t <= 90; t += 5) {
			const energy = calculateEnergyForOrientation(lat, doy, a, t, 4, 4);
			if (energy > bestEnergy) {
				bestEnergy = energy;
				bestAz = a;
				bestTilt = t;
			}
		}
	}

	// Phase 2: Fine refinement around best point (±10° azimuth, ±5° tilt, step 1°)
	for (let a = Math.max(90, bestAz - 10); a <= Math.min(270, bestAz + 10); a += 1) {
		for (let t = Math.max(0, bestTilt - 5); t <= Math.min(90, bestTilt + 5); t += 1) {
			const energy = calculateEnergyForOrientation(lat, doy, a, t, 4, 4);
			if (energy > bestEnergy) {
				bestEnergy = energy;
			}
		}
	}

	baselineCache[key] = bestEnergy;
	return bestEnergy;
}

/**
 * CORE SIMULATION
 * Returns curve, efficiency, and 'energyFactor' (Equivalent Sun Hours).
 */
function calculateSolarPotential(lat, doy, az, tilt, sFrom, sTo) {
	const curve = [];
	const step = 0.2; // Time step in hours

	// 1. Baseline: Get cached optimal energy
	const bestBaselineEnergy = getOptimalBaseline(lat, doy);

	// 2. User Setup
	const userNorm = getPanelNormal(az, tilt);
	let userSum = 0;

	for (let h = 4; h <= 22; h += step) {
		const sun = getSolarPos(lat, doy, h);

		if (sun.el <= 0) {
			curve.push({ h, p: 0, pPot: 0, blocked: false });
			continue;
		}

		const sunV = getVector(sun.az, sun.el);
		const intensity = Math.pow(sunV.z, 0.3);

		// User
		let p = 0, pPot = 0;
		let blocked = false;

		const dp = Math.max(0, dot(sunV, userNorm));
		pPot = dp * intensity;

		if (sFrom < sTo && h >= sFrom && h <= sTo) blocked = true;
		if (!blocked) p = pPot;

		userSum += p;
		curve.push({ h, p, pPot, blocked });
	}

	// Energy Factor = Sum * Step (Riemann Sum for integration)
	const energyFactor = userSum * step;
	const eff = bestBaselineEnergy > 0 ? (energyFactor / bestBaselineEnergy) * 100 : 0;

	return { curve, eff, energyFactor };
}

/**
 * Calculates Monthly and Yearly totals
 * @param {number} targetDoy - The specific day selected in UI (to identify current month)
 */
function calculateAggregates(lat, az, tilt, sFrom, sTo, targetDoy) {
	// Determine Month bounds for the selected DOY
	// Simple approx: 365/12. For precision we could use Date object but this is fast.
	// Let's use Date object logic in the loop for accuracy.

	const targetDate = new Date(2023, 0, 1 + targetDoy);
	const targetMonth = targetDate.getMonth();

	let yearTotal = 0;
	let monthTotal = 0;

	// Iterate whole year
	// We increase step to 1 day for speed, perfectly fine for estimation
	for (let d = 0; d < 365; d++) {
		const res = calculateSolarPotential(lat, d, az, tilt, sFrom, sTo);
		yearTotal += res.energyFactor;

		// Check if this day `d` belongs to the same month as `targetDoy`
		const dDate = new Date(2023, 0, 1 + d);
		if (dDate.getMonth() === targetMonth) {
			monthTotal += res.energyFactor;
		}
	}

	return { yearTotal, monthTotal };
}

function findOptimalOrientation(lat, doy, sFrom, sTo) {
	let best = { eff: -1, az: 180, tilt: 30 };
	// Step 10 to include 180 exactly
	for (let a = 90; a <= 270; a += 10) {
		for (let t = 0; t <= 90; t += 5) {
			const result = calculateSolarPotential(lat, doy, a, t, sFrom, sTo);
			if (result.eff > best.eff) {
				best = { eff: result.eff, az: a, tilt: t };
			}
		}
	}
	return best;
}

/**
 * Calculate weather-adjusted solar potential using cloud cover data
 * @param {number} lat - Latitude
 * @param {number} doy - Day of year
 * @param {number} az - Azimuth
 * @param {number} tilt - Tilt angle
 * @param {number} sFrom - Shadow start hour
 * @param {number} sTo - Shadow end hour
 * @param {Array} cloudCoverByHour - Array of 24 cloud cover percentages (0-100) indexed by hour
 * @returns {Object} { curve, eff, energyFactor, realEnergyFactor }
 */
function calculateWeatherAdjustedPotential(lat, doy, az, tilt, sFrom, sTo, cloudCoverByHour) {
	const result = calculateSolarPotential(lat, doy, az, tilt, sFrom, sTo);

	// If no cloud data, return ideal values
	if (!cloudCoverByHour || cloudCoverByHour.length === 0) {
		return { ...result, realEnergyFactor: result.energyFactor };
	}

	const step = 0.2;
	const userNorm = getPanelNormal(az, tilt);
	let realSum = 0;

	for (let h = 4; h <= 22; h += step) {
		const sun = getSolarPos(lat, doy, h);

		if (sun.el <= 0) continue;

		const sunV = getVector(sun.az, sun.el);
		const intensity = Math.pow(sunV.z, 0.3);

		let p = 0;
		let blocked = false;

		const dp = Math.max(0, dot(sunV, userNorm));
		let pPot = dp * intensity;

		if (sFrom < sTo && h >= sFrom && h <= sTo) blocked = true;
		if (!blocked) p = pPot;

		// Apply cloud cover reduction
		const hourIndex = Math.floor(h);
		const cloudCover = cloudCoverByHour[hourIndex] || 0;
		// Simple model: cloud cover reduces direct radiation
		// 0% cloud = 100% power, 100% cloud = ~20% power (diffuse only)
		const cloudFactor = 1 - (cloudCover / 100) * 0.8;

		realSum += p * cloudFactor;
	}

	const realEnergyFactor = realSum * step;

	return {
		...result,
		realEnergyFactor
	};
}

/**
 * Calculate weather-adjusted aggregates
 * @param {number} lat
 * @param {number} az
 * @param {number} tilt
 * @param {number} sFrom
 * @param {number} sTo
 * @param {number} targetDoy
 * @param {Object} weatherData - Map of doy -> cloudCoverByHour array
 * @returns {Object} { yearTotal, monthTotal, realYearTotal, realMonthTotal }
 */
function calculateWeatherAdjustedAggregates(lat, az, tilt, sFrom, sTo, targetDoy, weatherData) {
	const targetDate = new Date(2023, 0, 1 + targetDoy);
	const targetMonth = targetDate.getMonth();

	let yearTotal = 0;
	let monthTotal = 0;
	let realYearTotal = 0;
	let realMonthTotal = 0;

	for (let d = 0; d < 365; d++) {
		const cloudData = weatherData && weatherData[d] ? weatherData[d] : null;
		const res = calculateWeatherAdjustedPotential(lat, d, az, tilt, sFrom, sTo, cloudData);

		yearTotal += res.energyFactor;
		realYearTotal += res.realEnergyFactor;

		const dDate = new Date(2023, 0, 1 + d);
		if (dDate.getMonth() === targetMonth) {
			monthTotal += res.energyFactor;
			realMonthTotal += res.realEnergyFactor;
		}
	}

	return { yearTotal, monthTotal, realYearTotal, realMonthTotal };
}

function findOptimalOrientationForRange(lat, startMonth, endMonth, sFrom, sTo) {
	// 1. Determine reference day for Azimuth (midpoint of range)
	const startDoy = Math.floor(startMonth * 30.44);
	const endDoy = Math.floor((endMonth + 1) * 30.44) - 1;

	let midDoy;
	if (startDoy <= endDoy) {
		midDoy = Math.floor((startDoy + endDoy) / 2);
	} else {
		// Wraps around (e.g., Nov to Feb)
		midDoy = Math.floor((startDoy + endDoy + 365) / 2) % 365;
	}

	// Optimize Azimuth for the reference day
	const refOpt = findOptimalOrientation(lat, midDoy, sFrom, sTo);
	const targetAz = refOpt.az;

	// 2. Optimize Tilt for the period
	let bestTilt = 30;
	let maxEnergy = -1;

	// Use samples for speed (every 7 days)
	const samples = [];
	if (startDoy <= endDoy) {
		for (let d = startDoy; d <= endDoy; d += 7) samples.push(d);
	} else {
		for (let d = startDoy; d < 365; d += 7) samples.push(d);
		for (let d = 0; d <= endDoy; d += 7) samples.push(d);
	}

	// Coarse + Fine tilt search
	for (let t = 0; t <= 90; t += 5) {
		let periodEnergy = 0;
		for (const d of samples) {
			periodEnergy += calculateSolarPotential(lat, d, targetAz, t, sFrom, sTo).energyFactor;
		}
		if (periodEnergy > maxEnergy) {
			maxEnergy = periodEnergy;
			bestTilt = t;
		}
	}

	const coarseTilt = bestTilt;
	for (let t = Math.max(0, coarseTilt - 4); t <= Math.min(90, coarseTilt + 4); t += 1) {
		let periodEnergy = 0;
		for (const d of samples) {
			periodEnergy += calculateSolarPotential(lat, d, targetAz, t, sFrom, sTo).energyFactor;
		}
		if (periodEnergy > maxEnergy) {
			maxEnergy = periodEnergy;
			bestTilt = t;
		}
	}

	return { az: targetAz, tilt: bestTilt };
}
