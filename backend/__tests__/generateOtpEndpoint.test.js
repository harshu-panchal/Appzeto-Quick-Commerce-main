import { jest } from '@jest/globals';

// Mock dependencies
const mockOrderMatchQueryFromRouteParam = jest.fn();
const mockOrderFindOne = jest.fn();
const mockDeliveryFindById = jest.fn();
const mockGenerateDeliveryOtp = jest.fn();
const mockGetIO = jest.fn();
const mockHandleResponse = jest.fn();
const mockEmitToCustomer = jest.fn();

jest.unstable_mockModule('../app/utils/orderLookup.js', () => ({
  orderMatchQueryFromRouteParam: mockOrderMatchQueryFromRouteParam
}));

jest.unstable_mockModule('../app/models/order.js', () => ({
  default: {
    findOne: mockOrderFindOne
  }
}));

jest.unstable_mockModule('../app/models/delivery.js', () => ({
  default: {
    findById: mockDeliveryFindById
  }
}));

jest.unstable_mockModule('../app/services/deliveryOtpService.js', () => ({
  generateDeliveryOtp: mockGenerateDeliveryOtp
}));

jest.unstable_mockModule('../app/socket/socketManager.js', () => ({
  getIO: mockGetIO
}));

jest.unstable_mockModule('../app/services/orderSocketEmitter.js', () => ({
  emitToCustomer: mockEmitToCustomer
}));

jest.unstable_mockModule('../app/utils/helper.js', () => ({
  default: mockHandleResponse
}));

const { generateDeliveryOtp } = await import('../app/controller/deliveryController.js');

describe('POST /api/delivery/orders/:orderId/generate-otp', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      params: { orderId: 'ORD123456' },
      body: { location: { lat: 12.9728, lng: 77.5946 } },
      user: { id: 'delivery-user-id' }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Default mock implementation for handleResponse
    mockHandleResponse.mockImplementation((res, status, message, data) => {
      res.status(status).json({ message, ...data });
    });
  });

  describe('Success Cases', () => {
    it('should generate OTP successfully when within proximity range with provided location', async () => {
      // Mock order lookup
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id', name: 'John Doe', phone: '1234567890' },
          address: {
            location: { lat: 12.9716, lng: 77.5946 }
          }
        })
      });

      // Mock OTP generation success
      mockGenerateDeliveryOtp.mockResolvedValue({
        success: true,
        otp: '1234',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      // Mock Socket.IO
      const mockEmit = jest.fn();
      const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
      mockGetIO.mockReturnValue({ to: mockTo });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        200,
        'OTP generated and sent to customer',
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            otpGenerated: true,
            attemptsRemaining: 3
          })
        })
      );

      // Verify Socket.IO events were emitted
      expect(mockEmitToCustomer).toHaveBeenCalledWith('customer-id', {
        event: 'order:otp',
        payload: expect.objectContaining({
          orderId: 'ORD123456',
          otp: '1234',
          deliveryPersonNearby: true
        })
      });
      expect(mockEmitToCustomer).toHaveBeenCalledWith('customer-id', {
        event: 'delivery:otp:generated',
        payload: expect.objectContaining({
          orderId: 'ORD123456',
          otp: '1234',
          deliveryPersonNearby: true
        })
      });
      expect(mockTo).toHaveBeenCalledWith('order:ORD123456');
      expect(mockEmit).toHaveBeenCalledWith(
        'delivery:otp:generated',
        expect.objectContaining({
          orderId: 'ORD123456',
          otp: '1234',
          deliveryPersonNearby: true
        })
      );
    });

    it('should generate OTP successfully using stored location from database', async () => {
      // Remove location from request body
      req.body = {};

      // Mock delivery person with stored location
      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'delivery-user-id',
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9728] // [lng, lat] in GeoJSON format
          },
          lastLocationAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
        })
      });

      // Mock order lookup
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id', name: 'John Doe', phone: '1234567890' },
          address: {
            location: { lat: 12.9716, lng: 77.5946 }
          }
        })
      });

      // Mock OTP generation success
      mockGenerateDeliveryOtp.mockResolvedValue({
        success: true,
        otp: '1234',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      // Mock Socket.IO
      const mockEmit = jest.fn();
      const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
      mockGetIO.mockReturnValue({ to: mockTo });

      await generateDeliveryOtp(req, res);

      expect(mockDeliveryFindById).toHaveBeenCalledWith('delivery-user-id');
      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        200,
        'OTP generated and sent to customer',
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            otpGenerated: true,
            attemptsRemaining: 3
          })
        })
      );
    });
  });

  describe('Validation Errors', () => {
    it('should return 404 when delivery person not found (no location in body)', async () => {
      req.body = {};
      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        404,
        'Delivery person not found',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'DELIVERY_NOT_FOUND'
          })
        })
      );
    });

    it('should return 400 when stored location coordinates are missing', async () => {
      req.body = {};
      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'delivery-user-id',
          location: { type: 'Point', coordinates: [] },
          lastLocationAt: new Date()
        })
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Location not available',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_REQUIRED'
          })
        })
      );
    });

    it('should return 400 when stored location is default [0, 0]', async () => {
      req.body = {};
      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'delivery-user-id',
          location: { type: 'Point', coordinates: [0, 0] },
          lastLocationAt: new Date()
        })
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Location not available',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_REQUIRED'
          })
        })
      );
    });

    it('should return 400 when lastLocationAt is missing', async () => {
      req.body = {};
      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'delivery-user-id',
          location: { type: 'Point', coordinates: [77.5946, 12.9728] },
          lastLocationAt: null
        })
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Location data is stale',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_STALE'
          })
        })
      );
    });

    it('should return 400 when stored location is older than 5 minutes', async () => {
      req.body = {};
      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'delivery-user-id',
          location: { type: 'Point', coordinates: [77.5946, 12.9728] },
          lastLocationAt: new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
        })
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Location data is stale',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_STALE'
          })
        })
      );
    });

    it('should return 400 when provided location is not an object', async () => {
      req.body = { location: 'invalid' };

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Invalid location data',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_REQUIRED'
          })
        })
      );
    });

    it('should return 400 when lat is not a number', async () => {
      req.body = { location: { lat: 'invalid', lng: 77.5946 } };

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Invalid location coordinates',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_REQUIRED'
          })
        })
      );
    });

    it('should return 400 when lng is not a number', async () => {
      req.body = { location: { lat: 12.9728, lng: 'invalid' } };

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Invalid location coordinates',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_REQUIRED'
          })
        })
      );
    });

    it('should return 400 when lat is out of range', async () => {
      req.body = { location: { lat: 91, lng: 77.5946 } };

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Invalid location coordinates',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_REQUIRED',
            message: expect.stringContaining('Latitude must be between -90 and 90')
          })
        })
      );
    });

    it('should return 400 when lng is out of range', async () => {
      req.body = { location: { lat: 12.9728, lng: 181 } };

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Invalid location coordinates',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'LOCATION_REQUIRED',
            message: expect.stringContaining('longitude between -180 and 180')
          })
        })
      );
    });
  });

  describe('Order Not Found Errors', () => {
    it('should return 404 when order lookup returns null', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue(null);

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        404,
        'Order not found',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'ORDER_NOT_FOUND'
          })
        })
      );
    });

    it('should return 404 when order does not exist', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        404,
        'Order not found',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'ORDER_NOT_FOUND'
          })
        })
      );
    });

    it('should return 404 when order is not assigned to this delivery person', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'different-delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        404,
        'Order not found or not assigned to you',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'UNAUTHORIZED_DELIVERY'
          })
        })
      );
    });
  });

  describe('Proximity Errors', () => {
    it('should return 403 when delivery person is too far from location', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });

      mockGenerateDeliveryOtp.mockResolvedValue({
        success: false,
        error: 'Delivery person must be within 120-150 meters of delivery location. Current distance: 250m'
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        403,
        expect.stringContaining('distance'),
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'PROXIMITY_OUT_OF_RANGE'
          })
        })
      );
    });

    it('should return 403 when proximity check fails', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });

      mockGenerateDeliveryOtp.mockResolvedValue({
        success: false,
        error: 'Not within proximity range'
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        403,
        expect.stringContaining('proximity'),
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'PROXIMITY_OUT_OF_RANGE'
          })
        })
      );
    });
  });

  describe('Server Errors', () => {
    it('should return 500 when OTP generation fails', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });

      mockGenerateDeliveryOtp.mockResolvedValue({
        success: false,
        error: 'Database error'
      });

      await generateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        500,
        'Database error',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'GENERATION_FAILED'
          })
        })
      );
    });

    it('should handle Socket.IO errors gracefully', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });

      mockGenerateDeliveryOtp.mockResolvedValue({
        success: true,
        otp: '1234',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      // Mock Socket.IO to throw error
      mockGetIO.mockImplementation(() => {
        throw new Error('Socket.IO not initialized');
      });

      await generateDeliveryOtp(req, res);

      // Should still return success even if socket fails
      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        200,
        'OTP generated and sent to customer',
        expect.objectContaining({
          success: true
        })
      );
    });
  });
});
