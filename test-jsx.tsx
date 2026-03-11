const React = require('react');
const a = { editing: { type: 'click_upsell' } };
const comp = () => (
    <div>
        {a.editing.type === 'click_upsell' && (
            /* comment */
            <div>
                hello
            </div>
        )}
    </div>
);
