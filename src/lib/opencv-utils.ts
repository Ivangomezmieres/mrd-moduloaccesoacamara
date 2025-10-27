// OpenCV.js utilities for document scanning
declare const cv: any;

export interface DocumentCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export const isOpenCVReady = (): boolean => {
  return typeof cv !== 'undefined' && cv.Mat;
};

export const waitForOpenCV = (): Promise<void> => {
  return new Promise((resolve) => {
    if (isOpenCVReady()) {
      resolve();
      return;
    }
    
    const checkInterval = setInterval(() => {
      if (isOpenCVReady()) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
};

const DEBUG = false;

// Helper to read corners from a 4x1 CV_32FC2 Mat
const readCorners = (mat: any, width: number, height: number): DocumentCorners => {
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
  
  return {
    topLeft: { 
      x: clamp(mat.data32F[0], 0, width), 
      y: clamp(mat.data32F[1], 0, height) 
    },
    topRight: { 
      x: clamp(mat.data32F[2], 0, width), 
      y: clamp(mat.data32F[3], 0, height) 
    },
    bottomRight: { 
      x: clamp(mat.data32F[4], 0, width), 
      y: clamp(mat.data32F[5], 0, height) 
    },
    bottomLeft: { 
      x: clamp(mat.data32F[6], 0, width), 
      y: clamp(mat.data32F[7], 0, height) 
    }
  };
};

// Validate if contour is a good document candidate
const validateDocumentContour = (
  contour: any,
  area: number,
  frameWidth: number,
  frameHeight: number,
  gray: any, // grayscale image for whiteness check
  isFallback: boolean = false
): { isValid: boolean; score: number } => {
  const frameArea = frameWidth * frameHeight;
  const areaRatio = area / frameArea;

  // Relaxed thresholds for fallback mode
  const minArea = isFallback ? 0.2 : 0.25;
  const maxArea = 0.85;
  const minAspect = isFallback ? 0.45 : 0.5;
  const maxAspect = isFallback ? 2.2 : 2.0;

  // Reject if too small or too large
  if (areaRatio < minArea || areaRatio > maxArea) {
    if (DEBUG) console.log('Rejected: area ratio', areaRatio);
    return { isValid: false, score: 0 };
  }

  // Calculate aspect ratio
  const rect = cv.boundingRect(contour);
  const aspectRatio = rect.width / rect.height;

  // Documents typically have aspect ratio between 0.5 and 2.0 (portrait/landscape)
  if (aspectRatio < minAspect || aspectRatio > maxAspect) {
    if (DEBUG) console.log('Rejected: aspect ratio', aspectRatio);
    return { isValid: false, score: 0 };
  }

  // Check rectangularity: contour area vs minAreaRect area
  const minRect = cv.minAreaRect(contour);
  const minRectArea = minRect.size.width * minRect.size.height;
  const rectangularity = area / minRectArea;
  
  if (rectangularity < 0.75) {
    if (DEBUG) console.log('Rejected: rectangularity', rectangularity);
    return { isValid: false, score: 0 };
  }

  // Check centroid is not too close to edges (>4% margin)
  const moments = cv.moments(contour);
  const cx = moments.m10 / moments.m00;
  const cy = moments.m01 / moments.m00;
  const edgeMargin = 0.04;
  
  if (
    cx < frameWidth * edgeMargin ||
    cx > frameWidth * (1 - edgeMargin) ||
    cy < frameHeight * edgeMargin ||
    cy > frameHeight * (1 - edgeMargin)
  ) {
    if (DEBUG) console.log('Rejected: centroid too close to edge', cx, cy);
    return { isValid: false, score: 0 };
  }

  // Check whiteness (documents are typically lighter than background)
  const mask = new cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1);
  const contourVec = new cv.MatVector();
  contourVec.push_back(contour);
  cv.drawContours(mask, contourVec, 0, new cv.Scalar(255), -1);
  const meanVal = cv.mean(gray, mask);
  mask.delete();
  contourVec.delete();
  
  const whiteness = meanVal[0] / 255; // normalize to 0-1

  // Calculate score
  let score = areaRatio;
  
  // Bonus for ideal area (40-70%)
  if (areaRatio >= 0.4 && areaRatio <= 0.7) {
    score += 0.3;
  }
  
  // Bonus for high rectangularity
  if (rectangularity >= 0.85) {
    score += 0.1;
  }
  
  // Bonus for high whiteness (paper is typically bright)
  if (whiteness > 0.6) {
    score += 0.1;
  }

  if (DEBUG) {
    console.log('Valid contour:', {
      areaRatio: areaRatio.toFixed(3),
      aspectRatio: aspectRatio.toFixed(2),
      rectangularity: rectangularity.toFixed(3),
      whiteness: whiteness.toFixed(3),
      score: score.toFixed(3)
    });
  }

  return { isValid: true, score };
};

// Try to approximate contour to 4 points using multiple epsilon values
// Always returns CV_32FC2 format
const tryApproximateToQuad = (contour: any): any | null => {
  const peri = cv.arcLength(contour, true);
  const epsilons = [0.02, 0.04, 0.06, 0.08, 0.1];
  
  for (const epsilon of epsilons) {
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, epsilon * peri, true);
    
    if (approx.rows === 4) {
      // Convert to CV_32FC2 if needed
      if (approx.type() !== cv.CV_32FC2) {
        const converted = new cv.Mat();
        approx.convertTo(converted, cv.CV_32FC2);
        approx.delete();
        return converted;
      }
      return approx;
    }
    
    approx.delete();
  }
  
  return null;
};

// Get 4 corners from a contour (using convexHull or minAreaRect as fallback)
// Always returns 4x1 CV_32FC2 Mat
const getCornersFromContour = (contour: any): any | null => {
  // Try polygonal approximation first
  let quad = tryApproximateToQuad(contour);
  if (quad) return quad;
  
  // Try with convex hull
  const hull = new cv.Mat();
  cv.convexHull(contour, hull);
  quad = tryApproximateToQuad(hull);
  hull.delete();
  if (quad) return quad;
  
  // Last resort: use minAreaRect to get 4 corners (always returns CV_32FC2)
  const rect = cv.minAreaRect(contour);
  const vertices = cv.RotatedRect.points(rect);
  const cornersArray = new Float32Array([
    vertices[0].x, vertices[0].y,
    vertices[1].x, vertices[1].y,
    vertices[2].x, vertices[2].y,
    vertices[3].x, vertices[3].y
  ]);
  
  return cv.matFromArray(4, 1, cv.CV_32FC2, Array.from(cornersArray));
};

// Detect document edges in the frame
export const detectDocumentEdges = (
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement
): DocumentCorners | null => {
  if (!isOpenCVReady()) return null;

  const ctx = canvasElement.getContext('2d');
  if (!ctx) return null;

  // Draw video frame to canvas
  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

  let src = cv.imread(canvasElement);
  let gray = new cv.Mat();
  let blurred = new cv.Mat();
  let edges = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  try {
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // ===== STAGE 1: Canny Edge Detection with Dynamic Approximation =====
    
    // Apply bilateral filter to reduce noise while preserving edges
    cv.bilateralFilter(gray, blurred, 9, 75, 75);

    // Canny edge detection with adjusted thresholds for subtle edges
    cv.Canny(blurred, edges, 30, 100);

    // Apply morphological dilation to connect broken document edges
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    // Find contours
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (DEBUG) console.log('Stage 1: Found', contours.size(), 'contours');

    // Find the best contour that could be a document
    let bestScore = 0;
    let bestContour = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // Try to get 4 corners using dynamic approximation
      const quad = getCornersFromContour(contour);

      if (quad) {
        const validation = validateDocumentContour(quad, area, src.cols, src.rows, gray, false);

        if (validation.isValid && validation.score > bestScore) {
          bestScore = validation.score;
          if (bestContour) bestContour.delete();
          bestContour = quad;
        } else {
          quad.delete();
        }
      }
    }

    // If Stage 1 found a good document, return it
    if (bestContour) {
      const corners = readCorners(bestContour, src.cols, src.rows);

      bestContour.delete();
      contours.delete();
      hierarchy.delete();
      
      if (DEBUG) console.log('Stage 1: Document found with score', bestScore);
      return corners;
    }

    if (DEBUG) console.log('Stage 1: No document found, trying Stage 2 (segmentation)');

    // ===== STAGE 2: Fallback with Segmentation (OTSU) =====
    
    contours.delete();
    hierarchy.delete();
    
    // Try both binary and inverted binary thresholding
    const masks = [];
    
    // Binary OTSU
    const binary = new cv.Mat();
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    masks.push(binary);
    
    // Inverted binary OTSU
    const binaryInv = new cv.Mat();
    cv.threshold(gray, binaryInv, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    masks.push(binaryInv);

    bestScore = 0;
    bestContour = null;

    for (const mask of masks) {
      // Apply morphological closing to fill gaps
      const kernel2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
      cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel2, new cv.Point(-1, -1), 2);
      kernel2.delete();

      // Find contours in the mask
      const contours2 = new cv.MatVector();
      const hierarchy2 = new cv.Mat();
      cv.findContours(mask, contours2, hierarchy2, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      if (DEBUG) console.log('Stage 2: Found', contours2.size(), 'contours in mask');

      // Find largest contour with sufficient area
      for (let i = 0; i < contours2.size(); i++) {
        const contour = contours2.get(i);
        const area = cv.contourArea(contour);
        const areaRatio = area / (src.cols * src.rows);

        // Skip if area is too small
        if (areaRatio < 0.2) continue;

        // Try to get 4 corners
        const quad = getCornersFromContour(contour);

        if (quad) {
          const validation = validateDocumentContour(quad, area, src.cols, src.rows, gray, true);

          if (validation.isValid && validation.score > bestScore) {
            bestScore = validation.score;
            if (bestContour) bestContour.delete();
            bestContour = quad;
          } else {
            quad.delete();
          }
        }
      }

      contours2.delete();
      hierarchy2.delete();
    }

    // Clean up masks
    for (const mask of masks) {
      mask.delete();
    }

    // If Stage 2 found a document, return it
    if (bestContour) {
      const corners = readCorners(bestContour, src.cols, src.rows);

      bestContour.delete();
      if (DEBUG) console.log('Stage 2: Document found with score', bestScore);
      return corners;
    }

    if (DEBUG) console.log('Stage 2: No document found');
    return null;
  } catch (error) {
    console.error('Error detecting document edges:', error);
    return null;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
  }
};

// Order corners in clockwise order starting from top-left
const orderCorners = (corners: DocumentCorners): number[][] => {
  const points = [
    [corners.topLeft.x, corners.topLeft.y],
    [corners.topRight.x, corners.topRight.y],
    [corners.bottomRight.x, corners.bottomRight.y],
    [corners.bottomLeft.x, corners.bottomLeft.y]
  ];

  // Sort by y coordinate
  points.sort((a, b) => a[1] - b[1]);

  // Top two points
  const topPoints = points.slice(0, 2).sort((a, b) => a[0] - b[0]);
  // Bottom two points
  const bottomPoints = points.slice(2, 4).sort((a, b) => a[0] - b[0]);

  return [topPoints[0], topPoints[1], bottomPoints[1], bottomPoints[0]];
};

// Check if image is dark (needs illumination correction)
const isImageDark = (mat: any): boolean => {
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  const meanBrightness = cv.mean(gray);
  gray.delete();
  return meanBrightness[0] < 120; // threshold for "dark" image
};

// Check if image is blurry (needs sharpening)
const isImageBlurry = (mat: any): boolean => {
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  
  // Calculate Laplacian variance to detect blur
  const laplacian = new cv.Mat();
  cv.Laplacian(gray, laplacian, cv.CV_64F);
  
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  cv.meanStdDev(laplacian, mean, stddev);
  
  const variance = Math.pow(stddev.data64F[0], 2);
  
  gray.delete();
  laplacian.delete();
  mean.delete();
  stddev.delete();
  
  return variance < 100; // threshold for "blurry" image
};

// Crop and straighten document with minimal, conservative processing
export const cropAndStraighten = (
  imageElement: HTMLImageElement,
  corners: DocumentCorners,
  options: {
    autoEnhance?: boolean;
    outputQuality?: number;
  } = {}
): string => {
  if (!isOpenCVReady()) throw new Error('OpenCV not ready');

  const { autoEnhance = true, outputQuality = 0.97 } = options;

  const canvas = document.createElement('canvas');
  canvas.width = imageElement.width;
  canvas.height = imageElement.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  ctx.drawImage(imageElement, 0, 0);

  let src = cv.imread(canvas);
  let dst = new cv.Mat();

  try {
    // Order corners
    const orderedCorners = orderCorners(corners);

    // Calculate destination size dynamically
    const topWidth = Math.hypot(
      orderedCorners[1][0] - orderedCorners[0][0],
      orderedCorners[1][1] - orderedCorners[0][1]
    );
    const bottomWidth = Math.hypot(
      orderedCorners[2][0] - orderedCorners[3][0],
      orderedCorners[2][1] - orderedCorners[3][1]
    );
    const leftHeight = Math.hypot(
      orderedCorners[3][0] - orderedCorners[0][0],
      orderedCorners[3][1] - orderedCorners[0][1]
    );
    const rightHeight = Math.hypot(
      orderedCorners[2][0] - orderedCorners[1][0],
      orderedCorners[2][1] - orderedCorners[1][1]
    );

    const avgWidth = (topWidth + bottomWidth) / 2;
    const avgHeight = (leftHeight + rightHeight) / 2;
    
    // Limit output width to 1500px for optimal quality
    const maxWidth = 1500;
    let width = Math.min(avgWidth, maxWidth);
    let height = (avgHeight / avgWidth) * width;

    // Create source and destination points
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      orderedCorners[0][0], orderedCorners[0][1],
      orderedCorners[1][0], orderedCorners[1][1],
      orderedCorners[2][0], orderedCorners[2][1],
      orderedCorners[3][0], orderedCorners[3][1]
    ]);

    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      width, 0,
      width, height,
      0, height
    ]);

    // Get perspective transform matrix and apply warp
    const M = cv.getPerspectiveTransform(srcPoints, dstPoints);
    cv.warpPerspective(src, dst, M, new cv.Size(width, height));

    srcPoints.delete();
    dstPoints.delete();
    M.delete();

    // === Conservative Enhancement (only if autoEnhance is true) ===
    if (autoEnhance) {
      // Apply gentle CLAHE only if image is dark
      if (isImageDark(dst)) {
        let rgb = new cv.Mat();
        let lab = new cv.Mat();
        cv.cvtColor(dst, rgb, cv.COLOR_RGBA2RGB);
        cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
        
        let labChannels = new cv.MatVector();
        cv.split(lab, labChannels);
        
        // Conservative CLAHE settings
        let clahe = new cv.CLAHE(1.0, new cv.Size(16, 16));
        clahe.apply(labChannels.get(0), labChannels.get(0));
        
        cv.merge(labChannels, lab);
        cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
        cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA);
        
        labChannels.delete();
        lab.delete();
        rgb.delete();
      }

      // Apply subtle sharpening only if image is blurry
      if (isImageBlurry(dst)) {
        let blurred = new cv.Mat();
        cv.GaussianBlur(dst, blurred, new cv.Size(0, 0), 1.0);
        
        // Gentle unsharp mask: 1.1x original - 0.1x blurred
        cv.addWeighted(dst, 1.1, blurred, -0.1, 0, dst);
        blurred.delete();
      }
    }

    // Show result on canvas
    cv.imshow(canvas, dst);

    // Return high quality JPEG
    return canvas.toDataURL('image/jpeg', outputQuality);
  } catch (error) {
    console.error('Error cropping and straightening document:', error);
    throw error;
  } finally {
    src.delete();
    dst.delete();
  }
};

// Legacy function kept for backward compatibility
export const processDocument = cropAndStraighten;

// Check if document is well-framed for auto-capture
export const isDocumentWellFramed = (corners: DocumentCorners, canvasWidth: number, canvasHeight: number): boolean => {
  const orderedCorners = orderCorners(corners);
  
  // Dynamic margin: 4% of the smaller canvas dimension
  const margin = Math.min(canvasWidth, canvasHeight) * 0.04;
  
  for (const corner of orderedCorners) {
    if (
      corner[0] < margin ||
      corner[0] > canvasWidth - margin ||
      corner[1] < margin ||
      corner[1] > canvasHeight - margin
    ) {
      return false;
    }
  }

  // Check if document takes up a reasonable portion of the frame
  const width = Math.abs(orderedCorners[1][0] - orderedCorners[0][0]);
  const height = Math.abs(orderedCorners[3][1] - orderedCorners[0][1]);
  const area = width * height;
  const frameArea = canvasWidth * canvasHeight;
  const ratio = area / frameArea;

  // Ideal range: 25% to 85% of frame
  return ratio > 0.25 && ratio < 0.85;
};

// Draw overlay with detected corners
export const drawDocumentOverlay = (
  canvas: HTMLCanvasElement,
  corners: DocumentCorners,
  isValid: boolean
): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const orderedCorners = orderCorners(corners);

  ctx.strokeStyle = isValid ? '#96C549' : '#F87171';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(orderedCorners[0][0], orderedCorners[0][1]);
  for (let i = 1; i < orderedCorners.length; i++) {
    ctx.lineTo(orderedCorners[i][0], orderedCorners[i][1]);
  }
  ctx.closePath();
  ctx.stroke();

  // Draw corner circles
  ctx.fillStyle = isValid ? '#96C549' : '#F87171';
  for (const corner of orderedCorners) {
    ctx.beginPath();
    ctx.arc(corner[0], corner[1], 8, 0, 2 * Math.PI);
    ctx.fill();
  }
};
