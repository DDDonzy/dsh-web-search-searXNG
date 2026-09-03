/* UI-only toggle control. The host decides whether the staged value is accepted. */

function ToggleField({ value, disabled, label, onChange }) {
  return React.createElement(
    "div",
    { className: "dshSearxngToggleField" },
    React.createElement(
      "label",
      { className: "dshSearxngToggleLabel" },
      React.createElement("input", {
        className: "dshSearxngToggleInput",
        type: "checkbox",
        checked: value,
        disabled,
        onChange: (event) => onChange(event.target.checked),
      }),
      React.createElement("span", { className: "dshSearxngToggleText" }, label),
      React.createElement("span", { className: "dshSearxngToggleTrack", "aria-hidden": true }, React.createElement("span", { className: "dshSearxngToggleThumb" })),

    ),
  );
}
