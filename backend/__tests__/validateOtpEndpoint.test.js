import { jest } from '@jest/globals';

// Mock dependencies
const mockOrderMatchQueryFromRouteParam = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockDeliveryFindById = jest.fn();
const mockValidateDeliveryOtp = jest.fn();
const mockGetIO = jest.fn();
const mockHandleResponse = jest.fn();
const mockApplyDeliveredSettlement = jest.fn();

jest.unstable_mockModule('../app/utils/orderLookup.js', () => ({
  orderMatchQueryFromRouteParam: mockOrderMatchQueryFromRouteParam
}));

jest.unstable_mockModule('../app/models/order.js', () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: mockOrderFindOneAndUpdate
  }
}));

jest.unstable_mockModule('../app/models/delivery.js', () => ({
  default: {
    findById: mockDeliveryFindById
  }
}));

jest.unstable_mockModule('../app/services/deliveryOtpService.js', () => ({
  validateDeliveryOtp: mockValidateDeliveryOtp
}));

jest.unstable_mockModule('../app/socket/socketManager.js', () => ({
  getIO: mockGetIO
}));

jest.unstable_mockModule('../app/utils/helper.js', () => ({
  default: mockHandleResponse
}));

jest.unstable_mockModule('../app/services/orderSettlement.js', () => ({
  applyDeliveredSettlement: mockApplyDeliveredSettlement
}));

jest.unstable_mockModule('../app/constants/orderWorkflow.js', () => ({
  WORKFLOW_STATUS: {
    DELIVERED: 'delivered'
  }
}));

const { validateDeliveryOtp } = await import('../app/controller/deliveryController.js');

describe('POST /api/delivery/orders/:orderId/validate-otp', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      params: { orderId: 'ORD123456' },
      body: { otp: '1234' },
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
    it('should validate OTP successfully and mark order as delivered', async () => {
      // Mock order lookup
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id', name: 'John Doe', phone: '1234567890' }
        })
      });

      // Mock OTP validation success
      mockValidateDeliveryOtp.mockResolvedValue({
        valid: true,
        message: 'OTP validated successfully'
      });

      // Mock delivery location
      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9728]
          }
        })
      });

      // Mock order update
      mockOrderFindOneAndUpdate.mockResolvedValue({
        orderId: 'ORD123456',
        workflowStatus: 'delivered',
        status: 'delivered',
        deliveredAt: new Date()
      });

      // Mock Socket.IO
      const mockEmit = jest.fn();
      const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
      mockGetIO.mockReturnValue({ to: mockTo });

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        200,
        'Order delivered successfully',
        expect.objectContaining({
          success: true,
          message: 'Order delivered successfully',
          data: expect.objectContaining({
            orderId: 'ORD123456'
          })
        })
      );

      // Verify Socket.IO events were emitted
      expect(mockTo).toHaveBeenCalledWith('customer:customer-id');
      expect(mockTo).toHaveBeenCalledWith('order:ORD123456');
      expect(mockEmit).toHaveBeenCalledWith(
        'delivery:otp:validated',
        expect.objectContaining({
          orderId: 'ORD123456',
          status: 'delivered'
        })
      );
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 when OTP is missing', async () => {
      req.body = {};

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'OTP is required',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'OTP_INVALID_FORMAT'
          })
        })
      );
    });

    it('should return 400 when OTP is not a string', async () => {
      req.body = { otp: 1234 };

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'OTP is required',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'OTP_INVALID_FORMAT'
          })
        })
      );
    });

    it('should return 400 when OTP format is invalid (not 4 digits)', async () => {
      req.body = { otp: '123' };

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Invalid OTP format',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'OTP_INVALID_FORMAT'
          })
        })
      );
    });

    it('should return 400 when OTP contains non-numeric characters', async () => {
      req.body = { otp: 'abcd' };

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        400,
        'Invalid OTP format',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'OTP_INVALID_FORMAT'
          })
        })
      );
    });
  });

  describe('Order Not Found Errors', () => {
    it('should return 404 when order lookup returns null', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue(null);

      await validateDeliveryOtp(req, res);

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

      await validateDeliveryOtp(req, res);

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

      await validateDeliveryOtp(req, res);

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

    it('should return 404 when no active OTP found', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });

      mockValidateDeliveryOtp.mockResolvedValue({
        valid: false,
        error: 'OTP_NOT_FOUND',
        message: 'No OTP has been generated for this order yet'
      });

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        404,
        'No OTP has been generated for this order yet',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'OTP_NOT_FOUND'
          })
        })
      );
    });
  });

  describe('OTP Validation Errors', () => {
    beforeEach(() => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });
    });

    it('should return 401 when OTP is expired', async () => {
      mockValidateDeliveryOtp.mockResolvedValue({
        valid: false,
        error: 'OTP_EXPIRED',
        message: 'OTP has expired. Please generate a new OTP.',
        attemptsRemaining: 3
      });

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        401,
        'OTP has expired. Please generate a new OTP.',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'OTP_EXPIRED',
            attemptsRemaining: 3
          })
        })
      );
    });

    it('should return 403 when OTP does not match', async () => {
      mockValidateDeliveryOtp.mockResolvedValue({
        valid: false,
        error: 'OTP_MISMATCH',
        message: 'Invalid OTP. Please try again.',
        attemptsRemaining: 2
      });

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        403,
        'Invalid OTP. Please try again.',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'OTP_MISMATCH',
            attemptsRemaining: 2
          })
        })
      );
    });

    it('should return 423 when max attempts exceeded', async () => {
      mockValidateDeliveryOtp.mockResolvedValue({
        valid: false,
        error: 'MAX_ATTEMPTS_EXCEEDED',
        message: 'Maximum validation attempts exceeded. Supervisor intervention required.',
        attemptsRemaining: 0
      });

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        423,
        'Maximum validation attempts exceeded. Supervisor intervention required.',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'MAX_ATTEMPTS_EXCEEDED',
            attemptsRemaining: 0
          })
        })
      );
    });
  });

  describe('Server Errors', () => {
    it('should return 500 when validation service fails', async () => {
      mockOrderMatchQueryFromRouteParam.mockReturnValue({ orderId: 'ORD123456' });
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          orderId: 'ORD123456',
          deliveryBoy: 'delivery-user-id',
          customer: { _id: 'customer-id' }
        })
      });

      mockValidateDeliveryOtp.mockResolvedValue({
        valid: false,
        error: 'VALIDATION_FAILED',
        message: 'Failed to validate OTP. Please try again.'
      });

      await validateDeliveryOtp(req, res);

      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        500,
        'Failed to validate OTP. Please try again.',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_FAILED'
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

      mockValidateDeliveryOtp.mockResolvedValue({
        valid: true,
        message: 'OTP validated successfully'
      });

      mockDeliveryFindById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9728]
          }
        })
      });

      mockOrderFindOneAndUpdate.mockResolvedValue({
        orderId: 'ORD123456',
        workflowStatus: 'delivered',
        status: 'delivered',
        deliveredAt: new Date()
      });

      // Mock Socket.IO to throw error
      mockGetIO.mockImplementation(() => {
        throw new Error('Socket.IO not initialized');
      });

      await validateDeliveryOtp(req, res);

      // Should still return success even if socket fails
      expect(mockHandleResponse).toHaveBeenCalledWith(
        res,
        200,
        'Order delivered successfully',
        expect.objectContaining({
          success: true
        })
      );
    });
  });
});
