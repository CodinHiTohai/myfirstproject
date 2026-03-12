(async () => {
    try {
        // We'll just login as a driver
        const loginRes = await fetch('http://localhost:3000/api/auth/driver-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '9876543210', password: 'driver123' })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('Login Token:', token);

        // 1. Create a route
        console.log('Creating Route...');
        const routeRes = await fetch('http://localhost:3000/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                start_location: 'Patna',
                end_location: 'Gaya',
                stops: 'Jehanabad',
                fare: 150,
                total_seats: 10,
                lat: 25.0,
                lng: 85.0
            })
        });
        const routeData = await routeRes.text();
        console.log('Route Create Response:', routeData);

        // 2. Fetch Active Route
        console.log('Fetching Active Route...');
        const activeRes = await fetch('http://localhost:3000/api/routes/driver/active', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const activeData = await activeRes.text();
        console.log('Active Route:', activeData);

        // 3. Update Route (Go Live again)
        console.log('Updating Route...');
        const updateRes = await fetch('http://localhost:3000/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                start_location: 'Patna Junction',
                end_location: 'Gaya',
                stops: 'Jehanabad',
                fare: 150,
                total_seats: 10,
                lat: 25.1,
                lng: 85.1
            })
        });
        const updateData = await updateRes.text();
        console.log('Update Route Response:', updateData);

        // 4. Update the Active Route Again
        console.log('Updating Route Again...');
        const updateRes2 = await fetch('http://localhost:3000/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                start_location: 'Danapur',
                end_location: 'Gaya',
                stops: '',
                fare: 100,
                total_seats: 6,
                lat: 25.6,
                lng: 85.0
            })
        });
        const updateData2 = await updateRes2.text();
        console.log('Update Route 2 Response:', updateData2);

    } catch (e) { console.error(e) }
})();
