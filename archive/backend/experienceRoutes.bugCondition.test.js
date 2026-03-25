/**
 * Bug Condition Exploration Test
 * 
 * **Property 1: Fault Condition** - Reorder Endpoint Routes to Wrong Controller
 * **Validates: Requirements 2.1, 2.2, 2.3**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * 
 * This test verifies that PUT /admin/experience/reorder routes to the correct
 * reorderExperienceSections controller, not the updateExperienceSection controller.
 * 
 * On UNFIXED code, this test will FAIL because:
 * - The route definition order causes Express to match PUT /admin/experience/reorder
 *   to the PUT /admin/experience/:id route
 * - The request is routed to updateExperienceSection instead of reorderExperienceSections
 * - The controller tries to find a document with _id = "reorder", which fails validation
 * - Returns 400 error with MongoDB ObjectId validation failure
 * 
 * After the fix, this test should PASS.
 */

import request from 'supertest';
import express from 'express';

// Track which controller gets called
let calledController = null;

// Create mock controllers
const mockControllers = {
  getAdminExperienceSections: (req, res) => {
    calledController = 'getAdminExperienceSections';
    res.json({ sections: [] });
  },
  createExperienceSection: (req, res) => {
    calledController = 'createExperienceSection';
    res.json({ success: true });
  },
  updateExperienceSection: (req, res) => {
    calledController = 'updateExperienceSection';
    // Simulate the bug: trying to use "reorder" as an ObjectId
    if (req.params.id === 'reorder') {
      res.status(400).json({ error: 'Invalid ObjectId format for id: reorder' });
    } else {
      res.json({ success: true, message: 'Updated successfully' });
    }
  },
  deleteExperienceSection: (req, res) => {
    calledController = 'deleteExperienceSection';
    res.json({ success: true });
  },
  reorderExperienceSections: (req, res) => {
    calledController = 'reorderExperienceSections';
    res.json({ success: true, message: 'Reordered successfully' });
  },
  getPublicExperienceSections: (req, res) => {
    calledController = 'getPublicExperienceSections';
    res.json({ sections: [] });
  },
  uploadBannerImage: (req, res) => {
    calledController = 'uploadBannerImage';
    res.json({ success: true });
  },
};

// Mock auth middleware
const mockAuth = {
  verifyToken: (req, res, next) => next(),
  allowRoles: () => (req, res, next) => next(),
};

// Mock upload middleware
const mockUpload = {
  single: () => (req, res, next) => next(),
};

// Mock the actual modules before importing the routes
import { jest } from '@jest/globals';

// Mock the controller module
jest.unstable_mockModule('../app/controller/experienceController.js', () => mockControllers);

// Mock the auth middleware module
jest.unstable_mockModule('../app/middleware/authMiddleware.js', () => mockAuth);

// Mock the upload middleware module
jest.unstable_mockModule('../app/middleware/uploadMiddleware.js', () => ({
  default: mockUpload,
}));

// Now import the actual routes (which will use the mocked modules)
const { default: experienceRoutes } = await import('../app/routes/experienceRoutes.js');


describe('Bug Condition Exploration: Reorder Route Matching', () => {
  let app;

  beforeEach(() => {
    // Reset the controller tracker
    calledController = null;
    
    // Create a fresh Express app with the actual routes
    app = express();
    app.use(express.json());
    app.use(experienceRoutes);
  });

  test('PUT /admin/experience/reorder should route to reorderExperienceSections controller', async () => {
    const reorderPayload = {
      items: [
        { id: '507f1f77bcf86cd799439011', order: 0 },
        { id: '507f1f77bcf86cd799439012', order: 1 },
      ],
    };

    const response = await request(app)
      .put('/admin/experience/reorder')
      .send(reorderPayload)
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR: Should route to reorderExperienceSections
    expect(calledController).toBe('reorderExperienceSections');
    
    // EXPECTED BEHAVIOR: Should NOT route to updateExperienceSection
    expect(calledController).not.toBe('updateExperienceSection');
    
    // EXPECTED BEHAVIOR: Should return success response from reorder controller
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Reordered successfully');
    
    // EXPECTED BEHAVIOR: Should NOT return 400 error about invalid ObjectId
    expect(response.status).not.toBe(400);
    expect(response.body).not.toHaveProperty('error');
  });

  test('PUT /admin/experience/reorder should NOT have req.params.id set to "reorder"', async () => {
    const reorderPayload = {
      items: [
        { id: '507f1f77bcf86cd799439011', order: 0 },
      ],
    };

    await request(app)
      .put('/admin/experience/reorder')
      .send(reorderPayload);

    // EXPECTED BEHAVIOR: Should route to reorderExperienceSections, not updateExperienceSection
    // If it routes to updateExperienceSection with id="reorder", that's the bug
    expect(calledController).toBe('reorderExperienceSections');
  });

  test('PUT /admin/experience/reorder with empty items array should still route correctly', async () => {
    const reorderPayload = { items: [] };

    const response = await request(app)
      .put('/admin/experience/reorder')
      .send(reorderPayload);

    // EXPECTED BEHAVIOR: Should route to reorderExperienceSections
    expect(calledController).toBe('reorderExperienceSections');
    
    // EXPECTED BEHAVIOR: Should NOT return 400 error about invalid ObjectId "reorder"
    expect(response.status).not.toBe(400);
    if (response.status === 400) {
      expect(response.body.error).not.toContain('reorder');
    }
  });

  test('PUT /admin/experience/reorder should return success, not ObjectId validation error', async () => {
    const reorderPayload = {
      items: [
        { id: '507f1f77bcf86cd799439011', order: 0 },
        { id: '507f1f77bcf86cd799439012', order: 1 },
      ],
    };

    const response = await request(app)
      .put('/admin/experience/reorder')
      .send(reorderPayload);

    // EXPECTED BEHAVIOR: Should NOT return error about "reorder" being invalid ObjectId
    if (response.status === 400) {
      expect(response.body.error).not.toMatch(/invalid.*objectid.*reorder/i);
    }
    
    // EXPECTED BEHAVIOR: Should return success response
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
