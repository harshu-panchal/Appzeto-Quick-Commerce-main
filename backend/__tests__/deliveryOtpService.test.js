import { jest } from '@jest/globals';
import crypto from 'crypto';

// Mock dependencies
const mockCheckProximity = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderOtpHashCode = jest.fn();
const mockOrderOtpUpdateMany = jest.fn();
const mockOrderOtpCreate = jest.fn();
const mockOrderOtpFindOne = jest.fn();

jest.unstable_mockModule('../app/services/proximityService.js', () => ({
  checkProximity: mockCheckProximity
}));

jest.unstable_mockModule('../app/models/order.js', () => ({
  default: {
    findOne: mockOrderFindOne
  }
}));

jest.unstable_mockModule('../app/models/orderOtp.js', () => ({
  default: {
    hashCode: mockOrderOtpHashCode,
    updateMany: mockOrderOtpUpdateMany,
    create: mockOrderOtpCreate,
    findOne: mockOrderOtpFindOne
  }
}));

const { generateDeliveryOtp, isOtpExpired, validateDeliveryOtp } = await import('../app/services/deliveryOtpService.js');

describe('deliveryOtpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateDeliveryOtp', () => {
    const validOrderId = 'ORD123456';
    const validDeliveryLocation = { lat: 12.9728, lng: 77.5946 };
    const validCustomerLocation = { lat: 12.9716, lng: 77.5946 };

    it('should generate OTP successfully when within proximity range', async () => {
      // Mock order with valid location
      mockOrderFindOne.mockResolvedValue({
        _id: 'order-mongo-id',
        orderId: validOrderId,
        address: {
          location: validCustomerLocation
        }
      });

      // Mock proximity check - within range
      mockCheckProximity.mockReturnValue({
        inRange: true,
        distance: 133
      });

      // Mock OTP hashing
      mockOrderOtpHashCode.mockReturnValue('hashed-otp-value');

      // Mock database operations
      mockOrderOtpUpdateMany.mockResolvedValue({ modifiedCount: 0 });
      mockOrderOtpCreate.mockResolvedValue({});

      const result = await generateDeliveryOtp(validOrderId, validDeliveryLocation);

      expect(result.success).toBe(true);
      expect(result.otp).toBeDefined();
      expect(result.otp).toMatch(/^\d{4}$/); // 4-digit OTP
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();

      // Verify proximity was checked
      expect(mockCheckProximity).toHaveBeenCalledWith(
        validDeliveryLocation,
        validCustomerLocation
      );

      // Verify previous OTPs were invalidated
      expect(mockOrderOtpUpdateMany).toHaveBeenCalledWith(
        { orderId: validOrderId, type: 'delivery', consumedAt: null },
        { consumedAt: expect.any(Date) }
      );

      // Verify new OTP was created
      expect(mockOrderOtpCreate).toHaveBeenCalledWith(expect.objectContaining({
        orderId: validOrderId,
        orderMongoId: 'order-mongo-id',
        type: 'delivery',
        codeHash: 'hashed-otp-value',
        code: expect.stringMatching(/^\d{4}$/),
        expiresAt: expect.any(Date),
        attempts: 0,
        maxAttempts: 3,
        lastGeneratedAt: expect.any(Date)
      }));
    });

    it('should fail when orderId is missing', async () => {
      const result = await generateDeliveryOtp(null, validDeliveryLocation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Valid orderId is required');
      expect(result.otp).toBeUndefined();
    });

    it('should fail when delivery location is missing', async () => {
      const result = await generateDeliveryOtp(validOrderId, null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Valid delivery location is required');
      expect(result.otp).toBeUndefined();
    });

    it('should fail when delivery location has invalid coordinates', async () => {
      const result = await generateDeliveryOtp(validOrderId, { lat: 'invalid', lng: 77.5946 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Delivery location must have numeric lat and lng properties');
      expect(result.otp).toBeUndefined();
    });

    it('should fail when order is not found', async () => {
      mockOrderFindOne.mockResolvedValue(null);

      const result = await generateDeliveryOtp(validOrderId, validDeliveryLocation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Order not found');
      expect(result.otp).toBeUndefined();
    });

    it('should fail when order has no delivery location', async () => {
      mockOrderFindOne.mockResolvedValue({
        _id: 'order-mongo-id',
        orderId: validOrderId,
        address: {}
      });

      const result = await generateDeliveryOtp(validOrderId, validDeliveryLocation);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not have delivery coordinates/i);
      expect(result.otp).toBeUndefined();
    });

    it('should fail when delivery person is outside proximity range', async () => {
      mockOrderFindOne.mockResolvedValue({
        _id: 'order-mongo-id',
        orderId: validOrderId,
        address: {
          location: validCustomerLocation
        }
      });

      mockCheckProximity.mockReturnValue({
        inRange: false,
        distance: 250
      });

      const result = await generateDeliveryOtp(validOrderId, validDeliveryLocation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('within 0-120 meters');
      expect(result.error).toContain('250m');
      expect(result.otp).toBeUndefined();
    });

    it('should generate OTP with exactly 4 digits', async () => {
      mockOrderFindOne.mockResolvedValue({
        _id: 'order-mongo-id',
        orderId: validOrderId,
        address: {
          location: validCustomerLocation
        }
      });

      mockCheckProximity.mockReturnValue({
        inRange: true,
        distance: 133
      });

      mockOrderOtpHashCode.mockReturnValue('hashed-otp-value');
      mockOrderOtpUpdateMany.mockResolvedValue({ modifiedCount: 0 });
      mockOrderOtpCreate.mockResolvedValue({});

      const result = await generateDeliveryOtp(validOrderId, validDeliveryLocation);

      expect(result.success).toBe(true);
      expect(result.otp).toMatch(/^\d{4}$/);
      expect(result.otp.length).toBe(4);
    });

    it('should set expiration time to 10 minutes from now', async () => {
      mockOrderFindOne.mockResolvedValue({
        _id: 'order-mongo-id',
        orderId: validOrderId,
        address: {
          location: validCustomerLocation
        }
      });

      mockCheckProximity.mockReturnValue({
        inRange: true,
        distance: 133
      });

      mockOrderOtpHashCode.mockReturnValue('hashed-otp-value');
      mockOrderOtpUpdateMany.mockResolvedValue({ modifiedCount: 0 });
      mockOrderOtpCreate.mockResolvedValue({});

      const beforeGeneration = Date.now();
      const result = await generateDeliveryOtp(validOrderId, validDeliveryLocation);
      const afterGeneration = Date.now();

      expect(result.success).toBe(true);
      
      const expiresAtTime = result.expiresAt.getTime();
      const expectedMinExpiry = beforeGeneration + (10 * 60 * 1000);
      const expectedMaxExpiry = afterGeneration + (10 * 60 * 1000);

      expect(expiresAtTime).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(expiresAtTime).toBeLessThanOrEqual(expectedMaxExpiry);
    });

    it('should store OTP as SHA-256 hash', async () => {
      mockOrderFindOne.mockResolvedValue({
        _id: 'order-mongo-id',
        orderId: validOrderId,
        address: {
          location: validCustomerLocation
        }
      });

      mockCheckProximity.mockReturnValue({
        inRange: true,
        distance: 133
      });

      mockOrderOtpHashCode.mockImplementation((otp) => {
        return crypto.createHash('sha256').update(String(otp)).digest('hex');
      });

      mockOrderOtpUpdateMany.mockResolvedValue({ modifiedCount: 0 });
      mockOrderOtpCreate.mockResolvedValue({});

      const result = await generateDeliveryOtp(validOrderId, validDeliveryLocation);

      expect(result.success).toBe(true);
      expect(mockOrderOtpHashCode).toHaveBeenCalledWith(result.otp);
      
      // Verify the hash was passed to create
      const createCall = mockOrderOtpCreate.mock.calls[0][0];
      expect(createCall.codeHash).toBeDefined();
      expect(createCall.codeHash).not.toBe(result.otp); // Should be hashed, not plain
    });

    it('should initialize attempt tracking with maxAttempts: 3 and attempts: 0', async () => {
      mockOrderFindOne.mockResolvedValue({
        _id: 'order-mongo-id',
        orderId: validOrderId,
        address: {
          location: validCustomerLocation
        }
      });

      mockCheckProximity.mockReturnValue({
        inRange: true,
        distance: 133
      });

      mockOrderOtpHashCode.mockReturnValue('hashed-otp-value');
      mockOrderOtpUpdateMany.mockResolvedValue({ modifiedCount: 0 });
      mockOrderOtpCreate.mockResolvedValue({});

      await generateDeliveryOtp(validOrderId, validDeliveryLocation);

      const createCall = mockOrderOtpCreate.mock.calls[0][0];
      expect(createCall.attempts).toBe(0);
      expect(createCall.maxAttempts).toBe(3);
    });
  });

  describe('isOtpExpired', () => {
    it('should return true for expired OTP', () => {
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      expect(isOtpExpired(expiredDate)).toBe(true);
    });

    it('should return false for valid OTP', () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      expect(isOtpExpired(futureDate)).toBe(false);
    });

    it('should return true for OTP expiring exactly now', () => {
      const now = new Date(Date.now() - 1); // 1ms ago to ensure it's expired
      const result = isOtpExpired(now);
      expect(result).toBe(true);
    });
  });

  describe('validateDeliveryOtp', () => {
    const validOrderId = 'ORD123456';
    const validOtp = '1234';
    const validOtpHash = crypto.createHash('sha256').update(validOtp).digest('hex');

    beforeEach(() => {
      // Setup default mock for hashCode
      mockOrderOtpHashCode.mockImplementation((otp) => {
        return crypto.createHash('sha256').update(String(otp)).digest('hex');
      });
    });

    it('should validate OTP successfully when OTP matches', async () => {
      const mockOtpRecord = {
        orderId: validOrderId,
        codeHash: validOtpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null,
        save: jest.fn().mockResolvedValue({})
      };

      mockOrderOtpFindOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockOtpRecord)
      });

      const result = await validateDeliveryOtp(validOrderId, validOtp);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('OTP validated successfully');
      expect(result.error).toBeUndefined();
      expect(mockOtpRecord.consumedAt).toBeInstanceOf(Date);
      expect(mockOtpRecord.save).toHaveBeenCalled();
    });

    it('should fail when orderId is missing', async () => {
      const result = await validateDeliveryOtp(null, validOtp);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_FORMAT');
      expect(result.message).toBe('Valid orderId is required');
    });

    it('should fail when OTP is missing', async () => {
      const result = await validateDeliveryOtp(validOrderId, null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_FORMAT');
      expect(result.message).toBe('OTP is required');
    });

    it('should fail when OTP format is invalid (not 4 digits)', async () => {
      const invalidOtps = [
        { otp: '123', expectedMessage: 'OTP must be exactly 4 digits' },
        { otp: '12345', expectedMessage: 'OTP must be exactly 4 digits' },
        { otp: 'abcd', expectedMessage: 'OTP must be exactly 4 digits' },
        { otp: '12a4', expectedMessage: 'OTP must be exactly 4 digits' },
        { otp: '', expectedMessage: 'OTP is required' }
      ];

      for (const { otp, expectedMessage } of invalidOtps) {
        const result = await validateDeliveryOtp(validOrderId, otp);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('INVALID_FORMAT');
        expect(result.message).toBe(expectedMessage);
      }
    });

    it('should fail when no active OTP found', async () => {
      mockOrderOtpFindOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(null)
      });

      const result = await validateDeliveryOtp(validOrderId, validOtp);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('OTP_NOT_FOUND');
      expect(result.message).toMatch(/No OTP has been generated/i);
    });

    it('should fail when max attempts exceeded', async () => {
      const mockOtpRecord = {
        orderId: validOrderId,
        codeHash: validOtpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 3,
        maxAttempts: 3,
        consumedAt: null
      };

      mockOrderOtpFindOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockOtpRecord)
      });

      const result = await validateDeliveryOtp(validOrderId, validOtp);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('MAX_ATTEMPTS_EXCEEDED');
      expect(result.message).toContain('Maximum validation attempts exceeded');
      expect(result.attemptsRemaining).toBe(0);
    });

    it('should fail when OTP is expired', async () => {
      const mockOtpRecord = {
        orderId: validOrderId,
        codeHash: validOtpHash,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null
      };

      mockOrderOtpFindOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockOtpRecord)
      });

      const result = await validateDeliveryOtp(validOrderId, validOtp);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('OTP_EXPIRED');
      expect(result.message).toContain('OTP has expired');
      expect(result.attemptsRemaining).toBe(3);
    });

    it('should fail when OTP does not match and increment attempts', async () => {
      const wrongOtp = '5678';
      const mockOtpRecord = {
        orderId: validOrderId,
        codeHash: validOtpHash, // Hash of '1234'
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null,
        save: jest.fn().mockResolvedValue({})
      };

      mockOrderOtpFindOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockOtpRecord)
      });

      const result = await validateDeliveryOtp(validOrderId, wrongOtp);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('OTP_MISMATCH');
      expect(result.message).toBe('Invalid OTP. Please try again.');
      expect(result.attemptsRemaining).toBe(2);
      expect(mockOtpRecord.attempts).toBe(1);
      expect(mockOtpRecord.save).toHaveBeenCalled();
    });

    it('should track attempts correctly across multiple failures', async () => {
      const wrongOtp = '5678';
      const mockOtpRecord = {
        orderId: validOrderId,
        codeHash: validOtpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 2, // Already 2 failed attempts
        maxAttempts: 3,
        consumedAt: null,
        save: jest.fn().mockResolvedValue({})
      };

      mockOrderOtpFindOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockOtpRecord)
      });

      const result = await validateDeliveryOtp(validOrderId, wrongOtp);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('OTP_MISMATCH');
      expect(result.attemptsRemaining).toBe(0); // Last attempt used
      expect(mockOtpRecord.attempts).toBe(3);
    });

    it('should query for active OTP with correct filters', async () => {
      const mockOtpRecord = {
        orderId: validOrderId,
        codeHash: validOtpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null,
        save: jest.fn().mockResolvedValue({})
      };

      const mockSort = jest.fn().mockResolvedValue(mockOtpRecord);
      mockOrderOtpFindOne.mockReturnValue({
        sort: mockSort
      });

      await validateDeliveryOtp(validOrderId, validOtp);

      expect(mockOrderOtpFindOne).toHaveBeenCalledWith({
        orderId: validOrderId,
        type: 'delivery'
      });
      expect(mockSort).toHaveBeenCalledWith({
        lastGeneratedAt: -1,
        createdAt: -1,
      });
    });
  });
});
