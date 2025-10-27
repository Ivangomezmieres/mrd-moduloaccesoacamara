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

// Validate if contour is a good document candidate
const validateDocumentContour = (
  contour: any,
  area: number,
  frameWidth: number,
  frameHeight: number
): { isValid: boolean; score: number } => {
  const frameArea = frameWidth * frameHeight;
  const areaRatio = area / frameArea;

  // Reject if too small (< 25%) or too large (> 90%)
  if (areaRatio < 0.25 || areaRatio > 0.9) {
    return { isValid: false, score: 0 };
  }

  // Calculate aspect ratio
  const rect = cv.boundingRect(contour);
  const aspectRatio = rect.width / rect.height;

  // Documents typically have aspect ratio between 0.5 and 2.0 (portrait/landscape)
  if (aspectRatio < 0.5 || aspectRatio > 2.0) {
    return { isValid: false, score: 0 };
  }

  // Calculate score based on area (prefer documents that occupy 40-70% of frame)
  let score = areaRatio;
  if (areaRatio >= 0.4 && areaRatio <= 0.7) {
    score += 0.3; // Bonus for ideal area
  }

  return { isValid: true, score };
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

    // Apply bilateral filter to reduce noise while preserving edges
    cv.bilateralFilter(gray, blurred, 9, 75, 75);

    // Canny edge detection with adjusted thresholds for subtle edges
    cv.Canny(blurred, edges, 30, 100);

    // Apply morphological dilation to connect broken document edges
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    // Find contours
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Find the best contour that could be a document
    let bestScore = 0;
    let bestContour = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();

      // Approximate the contour to a polygon
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      // Check if it's a quadrilateral
      if (approx.rows === 4) {
        const validation = validateDocumentContour(approx, area, src.cols, src.rows);

        if (validation.isValid && validation.score > bestScore) {
          bestScore = validation.score;
          if (bestContour) bestContour.delete();
          bestContour = approx;
        } else {
          approx.delete();
        }
      } else {
        approx.delete();
      }
    }

    if (bestContour) {
      // Extract corners
      const corners: DocumentCorners = {
        topLeft: { x: bestContour.data32S[0], y: bestContour.data32S[1] },
        topRight: { x: bestContour.data32S[2], y: bestContour.data32S[3] },
        bottomRight: { x: bestContour.data32S[4], y: bestContour.data32S[5] },
        bottomLeft: { x: bestContour.data32S[6], y: bestContour.data32S[7] }
      };

      bestContour.delete();
      return corners;
    }

    return null;
  } catch (error) {
    console.error('Error detecting document edges:', error);
    return null;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
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

// Apply perspective transform and enhance document
export const processDocument = (
  imageElement: HTMLImageElement,
  corners: DocumentCorners
): string => {
  if (!isOpenCVReady()) throw new Error('OpenCV not ready');

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

    // Calculate destination size (A4 aspect ratio: 210/297 ≈ 0.707)
    const width = 800;
    const height = Math.round(width * 1.414); // A4 ratio

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

    // Get perspective transform matrix
    const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

    // Apply perspective transform
    cv.warpPerspective(src, dst, M, new cv.Size(width, height));

    // Convert to grayscale
    let gray = new cv.Mat();
    cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY);

    // Apply adaptive threshold for clean scan effect
    let binary = new cv.Mat();
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    // Show result on canvas
    cv.imshow(canvas, binary);

    // Clean up
    srcPoints.delete();
    dstPoints.delete();
    M.delete();
    gray.delete();
    binary.delete();

    // Return base64 image
    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  } finally {
    src.delete();
    dst.delete();
  }
};

// Check if document is well-framed for auto-capture
export const isDocumentWellFramed = (corners: DocumentCorners, canvasWidth: number, canvasHeight: number): boolean => {
  const orderedCorners = orderCorners(corners);
  
  // Check if corners are not too close to edges (reduced margin to allow larger documents)
  const margin = 30;
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

  // Ideal range: 30% to 80% of frame
  return ratio > 0.3 && ratio < 0.8;
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
