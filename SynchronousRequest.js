module.exports =
{
    httpGet: function(addr)
    {
        let p = new Promise((resolve, reject) => {
            https.get(addr, (response) => {
                let chunks_of_data = [];

                response.on('data', (fragments) => {
                    chunks_of_data.push(fragments);
                });

                response.on('end', () => {
                    let response_body = Buffer.concat(chunks_of_data);
                    
                    // promise resolved on success
                    // resolve(response_body.toString());
                    resolve(response_body);
                });

                response.on('error', (error) => {
                    // promise rejected on error
                    reject(error);
                });
            });
        });

        return p;
    }
};
