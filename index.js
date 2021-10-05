let btn = document.getElementById("btn");
let result = document.getElementById("result");

function handleClick() {
  result.textContent = "Clicked";
}

btn.addEventListener("click", handleClick);
