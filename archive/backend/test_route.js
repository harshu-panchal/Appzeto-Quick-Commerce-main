import axios from 'axios';

const test = async () => {
    try {
        const res = await axios.get('http://localhost:7000/api/admin/users');
        console.log('Status:', res.status);
        console.log('Data:', res.data);
    } catch (error) {
        console.error('Error Status:', error.response?.status);
        console.error('Error Message:', error.response?.data?.message || error.message);
    }
}

test();
