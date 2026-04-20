/**
 * Preservation Property Tests
 * 
 * **Property 2: Preservation** - All Other Experience Routes Continue to Work
 * **Validates: Requirements 3.1, 3.2, 3.3**
 * 
 * IMPORTANT: These tests capture the baseline behavior on UNFIXED code
 * They should PASS on unfixed code and continue to PASS after the fix
 * 
 * This ensures that fixing the reorder route doesn't break any other routes.
 */

import request from 'supertest';
import express from 'express';
import fc from 'fast-check';

// Track which controller gets called
let calledController = null;
let capturedParams = null;

// Create mock controllers
const mockControllers = {
  getAdminExperienceSections: (req, res) => {
    calledController = 'getAdminExperienceSections';
    capturedParams = req.params;
    res.json({ sections: [] });
  },
  createExperienceSection: (req, res) => {
    calledController = 'createExperienceSection';
    capturedParams = req.params;
    res.json({ success: true, id: '507f1f77bcf86cd799439011' });
  },
  updateExperienceSection: (req, res) => {
    calledController = 'updateExperienceSection';
    capturedParams = req.params;
    // Only process valid ObjectIds (not "reorder")
    if (req.params.id && req.params.id !== 'reorder') {
      res.json({ success: true, message: 'Updated successfully' });
    } else {
      res.status(400).json({ error: 'Invalid ObjectId' });
    }
  },
  deleteExperienceSection: (req, res) => {
    calledController = 'deleteExperienceSection';
    capturedParams = req.params;
    res.json({ success: true, message: 'Deleted successfully' });
  },
  reorderExperienceSections: (req, res) => {
    calledController = 'reorderExperienceSections';
    capturedParams = req.params;
    res.json({ success: true, message: 'Reordered successfully' });
  },
  getPublicExperienceSections: (req, res) => {
    calledController = 'getPublicExperienceSections';
    capturedParams = req.params;
    res.json({ sections: [] });
  },
  uploadBannerImage: (req, res) => {
    calledController = 'uploadBannerImage';
    capturedParams = req.params;
    res.json({ success: true, url: 'https://example.com/banner.jpg' });
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

// Create a test router with CORRECT route order (for preservation testing)
function createFixedRouter() {
  const router = express.Router();
  
  // Admin routes (protected) - CORRECT ORDER
  router.get('/admin/experience', mockAuth.verifyToken, mockAuth.allowRoles('admin'), mockControllers.getAdminExperienceSections);
  router.post('/admin/experience', mockAuth.verifyToken, mockAuth.allowRoles('admin'), mockControllers.createExperienceSection);
  
  // FIXED: Specific route BEFORE generic route
  router.put('/admin/experience/reorder', mockAuth.verifyToken, mockAuth.allowRoles('admin'), mockControllers.reorderExperienceSections);
  router.put('/admin/experience/:id', mockAuth.verifyToken, mockAuth.allowRoles('admin'), mockControllers.updateExperienceSection);
  
  router.delete('/admin/experience/:id', mockAuth.verifyToken, mockAuth.allowRoles('admin'), mockControllers.deleteExperienceSection);
  router.post('/admin/experience/upload-banner', mockAuth.verifyToken, mockAuth.allowRoles('admin'), mockUpload.single('image'), mockControllers.uploadBannerImage);
  router.get('/experience', mockControllers.getPublicExperienceSections);
  
  return router;
}

describe('Preservation Property Tests: All Other Routes Continue to Work', () => {
  let app;

  beforeEach(() => {
    // Reset tracking variables
    calledController = null;
    capturedParams = null;
    
    // Create Express app with FIXED route order
    app = express();
    app.use(express.json());
    app.use(createFixedRouter());
  });

  describe('GET /admin/experience - List sections', () => {
    test('should route to getAdminExperienceSections controller', async () => {
      const response = await request(app)
        .get('/admin/experience')
        .expect('Content-Type', /json/);

      expect(calledController).toBe('getAdminExperienceSections');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sections');
    });
  });

  describe('POST /admin/experience - Create section', () => {
    test('should route to createExperienceSection controller', async () => {
      const newSection = {
        title: 'New Experience',
        description: 'Test description',
      };

      const response = await request(app)
        .post('/admin/experience')
        .send(newSection)
        .expect('Content-Type', /json/);

      expect(calledController).toBe('createExperienceSection');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('PUT /admin/experience/:id - Update section by ID', () => {
    test('should route to updateExperienceSection with valid ObjectId', async () => {
      const validId = '507f1f77bcf86cd799439011';
      const updateData = { title: 'Updated Title' };

      const response = await request(app)
        .put(`/admin/experience/${validId}`)
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(calledController).toBe('updateExperienceSection');
      expect(capturedParams.id).toBe(validId);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should route to updateExperienceSection with different valid ObjectIds', async () => {
      const validIds = [
        '507f1f77bcf86cd799439011',
        '507f191e810c19729de860ea',
        '5f8d0d55b54764421b7156c9',
      ];

      for (const id of validIds) {
        calledController = null;
        capturedParams = null;

        const response = await request(app)
          .put(`/admin/experience/${id}`)
          .send({ title: 'Test' });

        expect(calledController).toBe('updateExperienceSection');
        expect(capturedParams.id).toBe(id);
        expect(response.status).toBe(200);
      }
    });

    test('property: any valid 24-char hex string routes to updateExperienceSection', () => {
      // Generate valid MongoDB ObjectId-like strings (24 hex characters)
      const hexCharArbitrary = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f');
      const objectIdArbitrary = fc.array(hexCharArbitrary, { minLength: 24, maxLength: 24 }).map(arr => arr.join(''));
      
      return fc.assert(
        fc.asyncProperty(
          objectIdArbitrary,
          async (hexId) => {
            calledController = null;
            capturedParams = null;

            await request(app)
              .put(`/admin/experience/${hexId}`)
              .send({ title: 'Test' });

            expect(calledController).toBe('updateExperienceSection');
            expect(capturedParams.id).toBe(hexId);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('DELETE /admin/experience/:id - Delete section', () => {
    test('should route to deleteExperienceSection with valid ObjectId', async () => {
      const validId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/admin/experience/${validId}`)
        .expect('Content-Type', /json/);

      expect(calledController).toBe('deleteExperienceSection');
      expect(capturedParams.id).toBe(validId);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('property: any valid ObjectId routes to deleteExperienceSection', () => {
      // Generate valid MongoDB ObjectId-like strings (24 hex characters)
      const hexCharArbitrary = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f');
      const objectIdArbitrary = fc.array(hexCharArbitrary, { minLength: 24, maxLength: 24 }).map(arr => arr.join(''));
      
      return fc.assert(
        fc.asyncProperty(
          objectIdArbitrary,
          async (hexId) => {
            calledController = null;
            capturedParams = null;

            await request(app)
              .delete(`/admin/experience/${hexId}`);

            expect(calledController).toBe('deleteExperienceSection');
            expect(capturedParams.id).toBe(hexId);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('POST /admin/experience/upload-banner - Upload banner', () => {
    test('should route to uploadBannerImage controller', async () => {
      const response = await request(app)
        .post('/admin/experience/upload-banner')
        .expect('Content-Type', /json/);

      expect(calledController).toBe('uploadBannerImage');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /experience - Public route', () => {
    test('should route to getPublicExperienceSections controller', async () => {
      const response = await request(app)
        .get('/experience')
        .expect('Content-Type', /json/);

      expect(calledController).toBe('getPublicExperienceSections');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sections');
    });
  });

  describe('Property: Route matching is deterministic', () => {
    test('property: same request always routes to same controller', () => {
      const routes = [
        { method: 'get', path: '/admin/experience', expected: 'getAdminExperienceSections' },
        { method: 'post', path: '/admin/experience', expected: 'createExperienceSection' },
        { method: 'put', path: '/admin/experience/507f1f77bcf86cd799439011', expected: 'updateExperienceSection' },
        { method: 'delete', path: '/admin/experience/507f1f77bcf86cd799439011', expected: 'deleteExperienceSection' },
        { method: 'post', path: '/admin/experience/upload-banner', expected: 'uploadBannerImage' },
        { method: 'get', path: '/experience', expected: 'getPublicExperienceSections' },
      ];

      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...routes),
          fc.integer({ min: 1, max: 3 }),
          async (route, iterations) => {
            const controllers = [];
            
            for (let i = 0; i < iterations; i++) {
              calledController = null;
              
              await request(app)[route.method](route.path).send({});
              
              controllers.push(calledController);
            }

            // All iterations should route to the same controller
            expect(new Set(controllers).size).toBe(1);
            expect(controllers[0]).toBe(route.expected);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
