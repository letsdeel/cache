const redis = ((url) => url && new (require('ioredis'))(url, {lazyConnect: true}))(process.env.REDIS_URL);

const store = ({ttl = 10 * 60000} = {}) => {
    const cache = {};
    return Object.assign(
        async (key, fn, opt) => {
            const context = {ttl: opt?.ttl ?? ttl};
            if (opt?.shared && redis) {
                return await (async (value) => {
                    if (value) return JSON.parse(value);
                    value = await fn.call(context);
                    if (context.ttl) await redis.set(key, JSON.stringify(value), 'EX', Math.floor(context.ttl / 1000));
                    return value;
                })(await redis.get(key));
            }
            if (opt?.invalidate || (cache[key]?.expiry || 0) < Date.now()) {
                const value = (cache[key] = {expiry: Date.now() + context.ttl});
                value.data = (async () => {
                    try {
                        return await fn.call(context);
                    } catch (err) {
                        context.ttl = 0;
                        throw err;
                    } finally {
                        value.expiry = context.ttl && Date.now() + context.ttl;
                    }
                })();
            }
            return await cache[key].data;
        },
        {
            remove: (key) => delete cache[key],
        }
    );
};

module.exports = Object.assign(store(), {
    create: (...args) => store(...args),
    close: async () => redis && (await redis.quit()),
});
