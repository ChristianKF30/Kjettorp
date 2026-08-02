const movier = require('movier');

async function testMovier() {
    try {
        const movie = await movier.getTitleDetailsByUrl('https://www.imdb.com/title/tt0111161/');
        console.log('Title:', movie.name);
        console.log('Type:', movie.titleType);
    } catch (err) {
        console.error('Error:', err);
    }
}

testMovier();
